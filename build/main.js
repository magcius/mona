// lexer / parser
System.register("lang", [], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    function construct_tokens(m) {
        const o = {}, p = [];
        for (const t of m) {
            const n = t.length;
            let nl = o[n];
            if (!nl) {
                nl = o[n] = { n: n, m: [] };
                p.push(nl);
            }
            nl.m.push(t);
        }
        p.sort((a, b) => (b.n - a.n));
        return p;
    }
    function* lexer(s) {
        let c = 0;
        function p() { return s[c]; }
        function n() { return s[c++]; }
        function pn(n) { return s.slice(c, c + n); }
        function r(n) { c += n; }
        function number() {
            let b = '';
            while (p().match(/\d/))
                b += n();
            return { kind: 'number', n: parseInt(b, 10) };
        }
        function string(b) {
            const d = b;
            while (true) {
                const c = n();
                if (c === '\\') {
                    const c2 = n();
                    switch (c2) {
                        case 'n': b += '\n';
                        case 'r': b += '\r';
                        case 't': b += '\t';
                        default: b += c2;
                    }
                }
                else if (c === d) {
                    break;
                }
                else {
                    b += c;
                }
            }
            return { kind: 'string', s: b };
        }
        const basic_tokens = construct_tokens(['=', '+', '-', '==', '<', '>', '<=', '>=', '(', ')', '{', '}', ',', ';']);
        const keywords = ['function', 'if', 'import', 'export', 'return'];
        function identifier() {
            let b = '';
            do {
                b += n();
            } while (b.match(/[a-zA-Z$_][a-zA-Z0-9$_]*$/));
            r(-1);
            b = b.slice(0, -1);
            return { kind: 'id', id: b };
        }
        function next() {
            while (true) {
                const m = p();
                if (m === undefined)
                    return null;
                // ignore white
                if (m.match(/\s/) && n())
                    continue;
                if (m.match(/\d/))
                    return number();
                if (m === '\'' || m === '"')
                    return string(m);
                for (const nl of basic_tokens) {
                    const c = pn(nl.n);
                    if (nl.m.indexOf(c) >= 0) {
                        r(nl.n);
                        return { kind: c };
                    }
                }
                for (const kw of keywords) {
                    const c = pn(kw.length + 1);
                    if (c.slice(0, kw.length) === kw && !c[kw.length].match(/[a-zA-Z0-9$_]/)) {
                        r(kw.length);
                        return { kind: kw };
                    }
                }
                return identifier();
            }
        }
        while (true) {
            const m = next();
            if (!m)
                break;
            yield m;
        }
    }
    function parser(s) {
        let c = null;
        function h() { return c; }
        function n() { const _ = c; const t = s.next(); c = t.done ? null : t.value; return _; }
        function a(b) { if (!b)
            throw new Error("fail"); }
        function e(k) { const m = n(); a(m.kind === k); return m; }
        function p(k) { return h().kind === k; }
        function m(k) { if (!p(k))
            return false; n(); return true; }
        n();
        function ei() { return e('id').id; }
        function en() { return e('number').n; }
        function es() { return e('string').s; }
        function pvalue() {
            switch (h().kind) {
                case 'id': return { k: 'load', id: ei() };
                case 'number': return { k: 'value', n: en() };
                case '(': return pexpr();
            }
        }
        function pfunccall() {
            const params = [];
            e('(');
            while (!p(')')) {
                params.push(pexpr());
                if (!m(','))
                    break;
            }
            e(')');
            return params;
        }
        function pbase() {
            let lhs = pvalue();
            while (h().kind === '(') {
                const params = pfunccall();
                lhs = { k: 'call', lhs, params };
            }
            return lhs;
        }
        function pbinop() {
            let lhs = pbase();
            while (['+', '-'].indexOf(h().kind) >= 0) {
                const op = n().kind;
                const rhs = pbase();
                lhs = { k: 'bin', op, lhs, rhs };
            }
            return lhs;
        }
        function pbincomp() {
            let lhs = pbinop();
            while (['<', '<=', '>', '>='].indexOf(h().kind) >= 0) {
                const op = n().kind;
                const rhs = pbinop();
                lhs = { k: 'bin', op, lhs, rhs };
            }
            return lhs;
        }
        function pexpr() {
            return pbincomp();
        }
        function pif() {
            e('if');
            e('(');
            const cond = pexpr();
            e(')');
            const body = pstmt();
            return { k: 'if', cond, body };
        }
        function pret() {
            e('return');
            const rhs = pexpr();
            e(';');
            return { k: 'ret', rhs };
        }
        function pexprstmt() {
            const expr = pexpr();
            e(';');
            return { k: 'expr', expr };
        }
        function pstmt() {
            switch (h().kind) {
                case 'if': return pif();
                case 'return': return pret();
                case '{': return pblock();
                default: return pexprstmt();
            }
        }
        function pblock() {
            e('{');
            const stmt = [];
            while (!m('}'))
                stmt.push(pstmt());
            return { k: 'block', stmt };
        }
        function ppspec() {
            const pspec = [];
            e('(');
            while (!p(')')) {
                pspec.push({ type: ei(), name: ei() });
                if (!m(','))
                    break;
            }
            e(')');
            return pspec;
        }
        function pfunc() {
            e('function');
            const reti = ei();
            const ret = { name: '$ret', type: reti };
            const name = ei();
            const params = ppspec();
            const exported = m('export');
            const imported = m('import');
            let body = null;
            if (imported)
                e(';');
            else
                body = pblock();
            const flags = (0) |
                (imported ? ast.funcflags.imported : 0) |
                (exported ? ast.funcflags.exported : 0);
            return { name, ret, params, body, flags };
        }
        function ptop() {
            const functions = [];
            while (h() !== null) {
                switch (h().kind) {
                    case 'function':
                        functions.push(pfunc());
                        break;
                    default: new Error();
                }
            }
            return { functions };
        }
        return ptop();
    }
    function parse(s) {
        const t = lexer(s);
        const p = parser(t);
        return p;
    }
    exports_1("parse", parse);
    var ast;
    return {
        setters: [],
        execute: function () {
            // lexer / parser
            // ast
            (function (ast) {
                ;
                ;
                ;
                ;
                ;
                ;
                let funcflags;
                (function (funcflags) {
                    funcflags[funcflags["imported"] = 1] = "imported";
                    funcflags[funcflags["exported"] = 2] = "exported";
                })(funcflags = ast.funcflags || (ast.funcflags = {}));
                ;
                ;
            })(ast || (ast = {}));
            exports_1("ast", ast);
        }
    };
});
// wasm binary encoding
System.register("wasm", [], function (exports_2, context_2) {
    "use strict";
    var __moduleName = context_2 && context_2.id;
    var valtype, blktype, wasmwriter, bodywriter;
    return {
        setters: [],
        execute: function () {
            // wasm binary encoding
            (function (valtype) {
                valtype[valtype["i32"] = 127] = "i32";
            })(valtype || (valtype = {}));
            exports_2("valtype", valtype);
            ;
            (function (blktype) {
                blktype[blktype["i32"] = 127] = "i32";
                blktype[blktype["none"] = 64] = "none";
            })(blktype || (blktype = {}));
            exports_2("blktype", blktype);
            wasmwriter = class wasmwriter {
                constructor(growAmt = 512) {
                    this.growAmt = growAmt;
                    this.buf = new ArrayBuffer(growAmt);
                    this.view = new DataView(this.buf);
                    this.offs = 0;
                }
                finish() {
                    return this.buf.slice(0, this.offs);
                }
                check_grow(length) {
                    const newOffs = this.offs + length;
                    if (newOffs > this.buf.byteLength) {
                        const newBuf = new ArrayBuffer(this.buf.byteLength + this.growAmt);
                        // Copy.
                        new Uint8Array(newBuf).set(new Uint8Array(this.buf));
                        this.buf = newBuf;
                        this.view = new DataView(this.buf);
                    }
                }
                copy_buf(buf) {
                    this.check_grow(buf.byteLength);
                    new Uint8Array(this.buf).set(new Uint8Array(buf), this.offs);
                    this.offs += buf.byteLength;
                }
                uint8(c) {
                    this.check_grow(1);
                    this.view.setUint8(this.offs++, c);
                }
                uint32(c) {
                    this.check_grow(4);
                    this.view.setUint32(this.offs, c, true);
                    this.offs += 4;
                }
                varuint(c, n, s) {
                    var cnbits = Math.ceil(Math.log2(c));
                    if (cnbits === 0)
                        cnbits = 1;
                    // Positive signed values need an extra bit.
                    if (c > 0 && s)
                        cnbits++;
                    if (cnbits > n)
                        throw new Error("Out of range");
                    var nbytes = Math.ceil(cnbits / 7);
                    this.check_grow(nbytes);
                    while (nbytes-- > 1) {
                        this.view.setUint8(this.offs++, 0x80 | (c & 0x7F));
                        c >>= 7;
                    }
                    this.view.setUint8(this.offs++, c & 0x7F);
                }
                varuint1(c) { return this.varuint(c, 1, false); }
                varuint7(c) { return this.varuint(c, 7, false); }
                varuint32(c) { return this.varuint(c, 32, false); }
                varint32(c) { return this.varuint(c, 32, true); }
                str(s) {
                    this.check_grow(s.length);
                    for (let i = 0; i < s.length; i++)
                        this.view.setUint8(this.offs++, s.charCodeAt(i));
                }
                pstr(s) {
                    this.varuint32(s.length);
                    this.str(s);
                }
            };
            exports_2("wasmwriter", wasmwriter);
            bodywriter = class bodywriter {
                constructor(nparams) {
                    this.locals = [];
                    this.nparams = nparams;
                    this.w = new wasmwriter();
                }
                finish() {
                    this.end();
                    const w = new wasmwriter();
                    w.varuint32(this.locals.length);
                    for (const vt of this.locals) {
                        // XXX: We should probably "RLE" / rearrange the locals of the same type
                        // but I'm far too lazy to do that rn.
                        w.varuint32(1);
                        w.uint8(vt);
                    }
                    w.copy_buf(this.w.finish());
                    return w.finish();
                }
                // Writer shortcuts.
                $u00(c) { this.w.uint8(c); }
                $u07(c, v) { this.$u00(c); this.w.varuint7(v); }
                $u32(c, v) { this.$u00(c); this.w.varuint32(v); }
                $s32(c, v) { this.$u00(c); this.w.varint32(v); }
                // Public API.
                $new_local(t) { return this.nparams + this.locals.push(t) - 1; }
                // Control flow operators.
                unreachable() { this.$u00(0x00); }
                nop() { this.$u00(0x01); }
                block(bt) { this.$u07(0x02, bt); }
                loop(bt) { this.$u07(0x03, bt); }
                if(bt) { this.$u07(0x04, bt); }
                else() { this.$u00(0x05); }
                end() { this.$u00(0x0b); }
                return() { this.$u00(0x0f); }
                // Call operators.
                call(idx) { this.$u32(0x10, idx); }
                call_indirect(idx) { this.$u32(0x10, idx); this.$u00(0 /* reserved */); }
                // Variable access.
                get_local(m) { this.$u32(0x20, m); }
                set_local(m) { this.$u32(0x21, m); }
                tee_local(m) { this.$u32(0x22, m); }
                get_global(m) { this.$u32(0x23, m); }
                set_global(m) { this.$u32(0x24, m); }
                // Constants.
                i32_const(v) { this.$s32(0x41, v); }
                // Comparison operators.
                i32_lt_u() { this.$u00(0x49); }
                i32_gt_u() { this.$u00(0x4B); }
                i32_le_u() { this.$u00(0x4D); }
                i32_ge_u() { this.$u00(0x4F); }
                // Numeric operators.
                i32_add() { this.$u00(0x6a); }
                i32_sub() { this.$u00(0x6b); }
            };
            exports_2("bodywriter", bodywriter);
        }
    };
});
// code generator
System.register("cgen", ["lang", "wasm"], function (exports_3, context_3) {
    "use strict";
    var __moduleName = context_3 && context_3.id;
    function binexpr(scope, b, m) {
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
    function loadexpr(scope, b, m) {
        const v = scope.find(m.id);
        assert(v && v.k === 'loc');
        b.get_local(v.idx);
    }
    function valexpr(scope, b, m) {
        b.i32_const(m.n);
    }
    function callexpr(scope, b, m) {
        assert(m.lhs.k === 'load');
        const load = m.lhs;
        const v = scope.find(load.id);
        assert(v && v.k === 'func');
        for (const p of m.params)
            expr(scope, b, p);
        b.call(v.idx);
    }
    function expr(scope, b, m) {
        switch (m.k) {
            case 'bin': return binexpr(scope, b, m);
            case 'load': return loadexpr(scope, b, m);
            case 'value': return valexpr(scope, b, m);
            case 'call': return callexpr(scope, b, m);
            default: const m_ = m;
        }
    }
    function sif(scope, b, m) {
        expr(scope, b, m.cond);
        // for now, if statements don't produce values
        b.if(wasm_1.blktype.none);
        stmt(scope, b, m.body);
        b.end();
    }
    function sret(scope, b, m) {
        expr(scope, b, m.rhs);
        b.return();
    }
    function sexpr(scope, b, m) {
        expr(scope, b, m.expr);
    }
    function stmt(scope, b, m) {
        switch (m.k) {
            case 'block':
                for (const s of m.stmt)
                    stmt(scope, b, s);
                break;
            case 'if': return sif(scope, b, m);
            case 'ret': return sret(scope, b, m);
            case 'expr': return sexpr(scope, b, m);
            default: const m_ = m;
        }
    }
    function assert(b) { if (!b)
        throw new Error('fail'); }
    function param(m) {
        if (m.type === 'void')
            return { name: m.name, type: 'void' };
        else if (m.type === 'int')
            return { name: m.name, type: wasm_1.valtype.i32 };
        else
            throw new Error("XXX");
    }
    function func(pscope, m) {
        const name = m.name;
        const params = m.params.map(param);
        const ret = param(m.ret);
        const type = { name, params, ret };
        const flags = m.flags;
        let body = null;
        if ((flags & lang_1.ast.funcflags.imported)) {
            return { type, kind: 'import' };
        }
        else {
            body = new wasm_1.bodywriter(params.length);
            const scope = pscope.sub();
            params.forEach((p, i) => scope.names.set(p.name, { k: 'loc', idx: i }));
            stmt(scope, body, m.body);
            const exported = !!(flags & lang_1.ast.funcflags.exported);
            return { type, kind: 'impl', exported, body };
        }
    }
    function module(m) {
        // global scope. define all functions.
        const g = new scope();
        // Assign indexes. Imports go first, according to the spec!
        m.functions.sort((a, b) => {
            return (b.flags & lang_1.ast.funcflags.imported) - (a.flags & lang_1.ast.funcflags.imported);
        });
        m.functions.forEach((af, i) => g.names.set(af.name, { k: 'func', idx: i }));
        const functions = m.functions.map((f) => {
            return func(g, f);
        });
        return { functions };
    }
    function cm(m) {
        var w = new wasm_1.wasmwriter();
        // Header
        w.str('\0asm');
        w.uint32(0x01);
        const functions = m.functions;
        const functypes = functions.map((cf) => cf.type);
        const funcimpls = functions.filter((cf) => cf.kind === 'impl');
        const funcimports = functions.filter((cf) => cf.kind === 'import');
        function sect(id, buf) {
            w.varuint7(id);
            w.varuint32(buf.byteLength);
            w.copy_buf(buf);
        }
        function sect_types() {
            const w = new wasm_1.wasmwriter();
            w.varuint32(functypes.length);
            function plist(pl_) {
                const pl = pl_.filter((p) => p.type !== 'void');
                w.varuint32(pl.length);
                for (const p of pl) {
                    if (p.type === 'void')
                        throw new Error();
                    w.uint8(p.type);
                }
            }
            for (const t of functypes) {
                w.uint8(0x60); // form = "func"
                plist(t.params);
                const retparams = [t.ret];
                plist(retparams);
            }
            return w.finish();
        }
        function sect_imports() {
            const w = new wasm_1.wasmwriter();
            w.varuint32(funcimports.length);
            for (const cf of funcimports) {
                w.pstr('imports'); // XXX: specify module name
                w.pstr(cf.type.name);
                w.uint8(0x00); // import function
                w.varuint32(functypes.indexOf(cf.type)); // type
            }
            return w.finish();
        }
        function sect_functions() {
            const w = new wasm_1.wasmwriter();
            w.varuint32(funcimpls.length);
            for (const cf of funcimpls) {
                w.varuint32(functypes.indexOf(cf.type)); // type
            }
            return w.finish();
        }
        function sect_exports() {
            const w = new wasm_1.wasmwriter();
            const exportable = funcimpls.filter((cf) => cf.exported);
            w.varuint32(exportable.length);
            for (const cf of exportable) {
                w.pstr(cf.type.name);
                w.uint8(0x00); // function
                w.varuint32(functions.indexOf(cf)); // funcidx
            }
            return w.finish();
        }
        function sect_code() {
            const w = new wasm_1.wasmwriter();
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
    function compile(m) {
        return cm(module(m));
    }
    exports_3("compile", compile);
    var lang_1, wasm_1, scope;
    return {
        setters: [
            function (lang_1_1) {
                lang_1 = lang_1_1;
            },
            function (wasm_1_1) {
                wasm_1 = wasm_1_1;
            }
        ],
        execute: function () {
            // code generator
            ;
            ;
            scope = class scope {
                constructor() {
                    this.names = new Map();
                }
                find(name) {
                    if (this.names.has(name))
                        return this.names.get(name);
                    else if (this.parent)
                        return this.parent.find(name);
                    else
                        return null;
                }
                sub() {
                    const s = new scope();
                    s.parent = this;
                    return s;
                }
            };
            ;
        }
    };
});
// debugging junk
System.register("util", [], function (exports_4, context_4) {
    "use strict";
    var __moduleName = context_4 && context_4.id;
    function hexdump(b) {
        function h(c, p) {
            let s = c.toString(16);
            while (s.length < p)
                s = '0' + s;
            return s;
        }
        function hb(a) {
            const d = [];
            for (let i = 0; i < a.byteLength; i++)
                d.push(h(a[i], 2));
            return d.join(' ');
        }
        const a = new Uint8Array(b);
        for (let i = 0; i < a.byteLength; i += 16)
            console.log("%s:  %s", h(i, 4), hb(a.slice(i, i + 16)));
    }
    exports_4("hexdump", hexdump);
    function download(bin, name = 'test.wasm') {
        const a = document.createElement('a');
        a.download = name;
        a.href = window.URL.createObjectURL(new Blob([bin], { type: 'application/octet-stream' }));
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    exports_4("download", download);
    function load(moduleSource, importsObject = null) {
        // Until TypeScript gains support for WASM, or I figure out
        // how to use declaration files...
        const wasm = window.WebAssembly;
        const m = new wasm.Module(moduleSource);
        const i = new wasm.Instance(m, importsObject);
        return i;
    }
    exports_4("load", load);
    return {
        setters: [],
        execute: function () {
            // debugging junk
        }
    };
});
System.register("main", ["lang", "cgen", "util"], function (exports_5, context_5) {
    "use strict";
    var __moduleName = context_5 && context_5.id;
    var lang_2, cgen_1, util_1;
    return {
        setters: [
            function (lang_2_1) {
                lang_2 = lang_2_1;
            },
            function (cgen_1_1) {
                cgen_1 = cgen_1_1;
            },
            function (util_1_1) {
                util_1 = util_1_1;
            }
        ],
        execute: function () {
            window.onload = function () {
                const source = `
function void print(int n) import;

function int fib(int n) export {
    if (n < 2)
        return n;
    print(n);
    return fib(n - 2) + fib(n - 1);
}
`;
                const m = lang_2.parse(source);
                const w = cgen_1.compile(m);
                const importsObject = { imports: { print: function (n) { console.log(n); } } };
                const i = util_1.load(w, importsObject);
                console.log(i.exports.fib(10));
            };
        }
    };
});
//# sourceMappingURL=main.js.map