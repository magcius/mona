
// code generator

import {ast} from 'lang';
import {blktype, valtype, wasmwriter, bodywriter} from 'wasm';

interface vfunc { k:'func', idx:number };
interface vloc { k:'loc', idx:number };
type value = vfunc | vloc;

class scope {
    names:Map<string,value>;
    parent:scope;

    constructor() {
        this.names = new Map<string,value>();
    }

    find(name:string):value { 
        if (this.names.has(name)) return this.names.get(name);
        else if (this.parent) return this.parent.find(name);
        else return null;
    }

    sub() {
        const s = new scope();
        s.parent = this;
        return s;
    }
}

function binexpr(scope:scope, b:bodywriter, m:ast.binexpr) {
    expr(scope, b, m.lhs);
    expr(scope, b, m.rhs);
    switch (m.op) {
    case '<': return b.i32_lt_u();
    case '>': return b.i32_gt_u();
    case '<=': return b.i32_le_u();
    case '>=': return b.i32_ge_u();
    case '+': return b.i32_add();
    case '-': return b.i32_sub();
    }
}

function loadexpr(scope:scope, b:bodywriter, m:ast.loadexpr) {
    const v = scope.find(m.id);
    assert(v && v.k === 'loc');
    b.get_local(v.idx);
}

function valexpr(scope:scope, b:bodywriter, m:ast.valexpr) {
    b.i32_const(m.n);
}

function callexpr(scope:scope, b:bodywriter, m:ast.callexpr) {
    assert(m.lhs.k === 'load');
    const load = (<ast.loadexpr> m.lhs);
    const v = scope.find(load.id);
    assert(v && v.k === 'func');
    for (const p of m.params) expr(scope, b, p);
    b.call(v.idx);
}

function expr(scope:scope, b:bodywriter, m:ast.expr) {
    switch (m.k) {
    case 'bin': return binexpr(scope, b, m);
    case 'load': return loadexpr(scope, b, m);
    case 'value': return valexpr(scope, b, m);
    case 'call': return callexpr(scope, b, m);
    default: const m_:never = m;
    }
}

function sif(scope:scope, b:bodywriter, m:ast.sif) {
    expr(scope, b, m.cond);
    // for now, if statements don't produce values
    b.if(blktype.none);
    stmt(scope, b, m.body);
    b.end();
}

function sret(scope:scope, b:bodywriter, m:ast.sret) {
    expr(scope, b, m.rhs);
    b.return();
}

function sexpr(scope:scope, b:bodywriter, m:ast.sexprstmt) {
    expr(scope, b, m.expr);
}

function stmt(scope:scope, b:bodywriter, m:ast.stmt) {
    switch (m.k) {
    case 'block': for (const s of m.stmt) stmt(scope, b, s); break;
    case 'if': return sif(scope, b, m);
    case 'ret': return sret(scope, b, m);
    case 'expr': return sexpr(scope, b, m);
    default: const m_:never = m;
    }
}

type gtype = valtype | 'void';
interface gparam { name:string, type:gtype };

function assert(b:boolean) { if (!b) throw new Error('fail') }

function param(m:ast.param):gparam {
    if (m.type === 'void')
        return { name: m.name, type: 'void' };
    else if (m.type === 'int')
        return { name: m.name, type: valtype.i32 };
    else
        throw new Error("XXX");
}

interface gfunctype { name:string; ret:gparam; params:gparam[]; }
interface gfuncimport { kind:'import'; type:gfunctype; }
interface gfuncimpl { kind:'impl'; type:gfunctype; exported:boolean; body:bodywriter; }
type gfunc = gfuncimport | gfuncimpl;

function func(pscope:scope, m:ast.func):gfunc {
    const name = m.name;
    const params = m.params.map(param);
    const ret = param(m.ret);
    const type = { name, params, ret };

    const flags = m.flags;
    let body = null;
    if ((flags & ast.funcflags.imported)) {
        return { type, kind: 'import' };
    } else {
        body = new bodywriter(params.length);
        const scope = pscope.sub();
        params.forEach((p, i) => scope.names.set(p.name, { k:'loc', idx: i }));
        stmt(scope, body, m.body);
        const exported = !!(flags & ast.funcflags.exported);
        return { type, kind: 'impl', exported, body };
    }
}

interface gmod { functions:gfunc[]; }

function module(m:ast.module):gmod {
    // global scope. define all functions.
    const g = new scope();

    // Assign indexes. Imports go first, according to the spec!
    m.functions.sort((a, b) => {
        return (b.flags & ast.funcflags.imported) - (a.flags & ast.funcflags.imported);
    });
    m.functions.forEach((af, i) => g.names.set(af.name, { k:'func', idx: i }));

    const functions = m.functions.map((f) => {
        return func(g, f);
    });

    return { functions };
}

function cm(m:gmod):ArrayBuffer {
    var w = new wasmwriter();
    // Header
    w.str('\0asm');
    w.uint32(0x01);

    const functions = m.functions;
    const functypes = functions.map((cf) => cf.type);
    const funcimpls:gfuncimpl[] = (<gfuncimpl[]> functions.filter((cf) => cf.kind === 'impl'));
    const funcimports:gfuncimport[] = (<gfuncimport[]> functions.filter((cf) => cf.kind === 'import'));

    function sect(id:number, buf:ArrayBuffer) {
        w.varuint7(id);
        w.varuint32(buf.byteLength);
        w.copy_buf(buf);
    }

    function sect_types():ArrayBuffer {
        const w = new wasmwriter();
        w.varuint32(functypes.length);

        function plist(pl_:gparam[]) {
            const pl = pl_.filter((p) => p.type !== 'void');
            w.varuint32(pl.length);
            for (const p of pl) {
                if (p.type === 'void')
                    throw new Error();
                w.uint8(p.type);
            }
        }

        for (const t of functypes) {
            w.uint8(0x60);  // form = "func"
            plist(t.params);
            const retparams = [t.ret];
            plist(retparams);
        }

        return w.finish();
    }

    function sect_imports():ArrayBuffer {
        const w = new wasmwriter();

        w.varuint32(funcimports.length);

        for (const cf of funcimports) {
            w.pstr('imports'); // XXX: specify module name
            w.pstr(cf.type.name);
            w.uint8(0x00); // import function
            w.varuint32(functypes.indexOf(cf.type)); // type
        }

        return w.finish();
    }

    function sect_functions():ArrayBuffer {
        const w = new wasmwriter();
        w.varuint32(funcimpls.length);
        for (const cf of funcimpls) {
            w.varuint32(functypes.indexOf(cf.type)); // type
        }
        return w.finish();
    }

    function sect_exports():ArrayBuffer {
        const w = new wasmwriter();

        const exportable = funcimpls.filter((cf) => cf.exported);
        w.varuint32(exportable.length);

        for (const cf of exportable) {
            w.pstr(cf.type.name);
            w.uint8(0x00); // function
            w.varuint32(functions.indexOf(cf)); // funcidx
        }

        return w.finish();
    }

    function sect_code():ArrayBuffer {
        const w = new wasmwriter();
        w.varuint32(funcimpls.length);

        for (const cf of funcimpls) {
            const buf = cf.body.finish();
            w.varuint32(buf.byteLength);
            w.copy_buf(buf);
        }

        return w.finish();
    }

    sect(0x01, sect_types());
    sect(0x02, sect_imports());
    sect(0x03, sect_functions());
    sect(0x07, sect_exports());
    sect(0x0A, sect_code());

    return w.finish();
}

export function compile(m:ast.module):ArrayBuffer {
    return cm(module(m));
}
