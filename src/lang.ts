
// lexer / parser

interface tokn { kind:'number'; n:number; }
interface toks { kind:'string'; s:number; }
interface toki { kind:'id'; id:string; }
interface toko { kind:string; }
type token = tokn | toks | toki | toko;

function construct_tokens(m:string[]) {
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

function* lexer(s:string) {
    let c = 0;
    function p():string { return s[c]; }
    function n():string { return s[c++]; }
    function pn(n:number) { return s.slice(c, c+n); }
    function r(n:number) { c += n; }

    function number():token {
        let b = '';
        while (p().match(/\d/)) b += n();
        return { kind: 'number', n: parseInt(b, 10) };
    }

    function string(b:string):token {
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
                // xxx: \x / \u
                }
            } else if (c === d) {
                break;
            } else {
                b += c;
            }
        }
        return { kind: 'string', s: b };
    }

    const basic_tokens = construct_tokens(['=', '+', '-', '==', '<', '>', '<=', '>=', '(', ')', '{', '}', ',', ';']);
    const keywords = ['function', 'if', 'import', 'export', 'return'];

    function identifier():token {
        let b = '';
        do { b += n(); } while(b.match(/[a-zA-Z$_][a-zA-Z0-9$_]*$/));
        r(-1);
        b = b.slice(0, -1);
        return { kind: 'id', id: b };
    }

    function next():token {
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
        if (!m) break;
        yield m;
    }
}

// ast
export namespace ast {
    export interface binexpr { k:'bin', op:string, lhs:expr, rhs:expr };
    export interface loadexpr { k:'load', id:string };
    export interface valexpr { k:'value', n:number };
    export interface callexpr { k:'call', lhs:expr, params:expr[] };
    export type expr = binexpr | loadexpr | valexpr | callexpr;
    export interface sif { k:'if', cond:expr, body:stmt };
    export interface sret { k:'ret', rhs:expr };
    export interface sblock { k:'block', stmt:stmt[] }
    export interface sexprstmt { k:'expr', expr:expr }
    export type stmt = sif | sret | sblock | sexprstmt;
    export interface param { type:string; name:string }
    export enum funcflags { imported = 0x01, exported = 0x02 };
    export interface func { name:string; params:param[]; ret:param; body:sblock, flags:funcflags };
    export interface module { functions:func[] }
}

function parser(s):ast.module {
    let c = null;
    function h():token { return c; }
    function n():token { const _ = c; const t = s.next(); c = t.done ? null : t.value; return _; }
    function a(b:boolean) { if (!b) throw new Error("fail"); }
    function e(k:string):token { const m = n(); a(m.kind === k); return m; }
    function p(k:string):boolean { return h().kind === k; }
    function m(k:string):boolean { if (!p(k)) return false; n(); return true; }
    n();

    function ei() { return (<toki> e('id')).id; }
    function en() { return (<tokn> e('number')).n; }
    function es() { return (<toks> e('string')).s; }

    function pvalue():ast.expr {
        switch (h().kind) {
        case 'id': return { k:'load', id:ei() };
        case 'number': return { k:'value', n:en() };
        case '(': return pexpr();
        }
    }

    function pfunccall():ast.expr[] {
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

    function pbase():ast.expr {
        let lhs = pvalue();
        while (h().kind === '(') {
            const params = pfunccall();
            lhs = { k:'call', lhs, params };
        }
        return lhs;
    }

    function pbinop():ast.expr {
        let lhs = pbase();
        while (['+', '-'].indexOf(h().kind) >= 0) {
            const op = n().kind;
            const rhs = pbase();
            lhs = { k:'bin', op, lhs, rhs };
        }
        return lhs;
    }

    function pbincomp():ast.expr {
        let lhs = pbinop();
        while (['<', '<=', '>', '>='].indexOf(h().kind) >= 0) {
            const op = n().kind;
            const rhs = pbinop();
            lhs = { k:'bin', op, lhs, rhs };
        }
        return lhs;
    }

    function pexpr():ast.expr {
        return pbincomp();
    }

    function pif():ast.stmt {
        e('if'); e('(');
        const cond = pexpr();
        e(')');
        const body = pstmt();
        return { k:'if', cond, body };
    }

    function pret():ast.stmt {
        e('return');
        const rhs = pexpr();
        e(';');
        return { k:'ret', rhs };
    }

    function pexprstmt():ast.stmt {
        const expr = pexpr();
        e(';');
        return { k:'expr', expr };
    }

    function pstmt():ast.stmt {
        switch (h().kind) {
        case 'if'    : return pif();
        case 'return': return pret();
        case '{'     : return pblock();
        default      : return pexprstmt();
        }
    }

    function pblock():ast.sblock {
        e('{');
        const stmt = [];
        while (!m('}'))
            stmt.push(pstmt());
        return { k:'block', stmt };
    }

    function ppspec():ast.param[] {
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

    function pfunc():ast.func {
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

    function ptop():ast.module {
        const functions:ast.func[] = [];
        while (h() !== null) {
            switch (h().kind) {
            case 'function': functions.push(pfunc()); break;
            default: new Error();
            }
        }
        return { functions };
    }

    return ptop();
}

export function parse(s:string):ast.module {
    const t = lexer(s);
    const p = parser(t);
    return p;
}
