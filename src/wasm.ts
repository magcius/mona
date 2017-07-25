
// wasm binary encoding

export enum valtype {
    i32 = 0x7f,
};

export enum blktype {
    i32 = valtype.i32,
    none = 0x40,
}

export class wasmwriter {
    growAmt:number;
    buf:ArrayBuffer;
    view:DataView;
    offs:number;

    constructor(growAmt:number = 512) {
        this.growAmt = growAmt;
        this.buf = new ArrayBuffer(growAmt);
        this.view = new DataView(this.buf);
        this.offs = 0;
    }

    finish() {
        return this.buf.slice(0, this.offs);
    }

    check_grow(length:number) {
        const newOffs = this.offs + length;
        if (newOffs > this.buf.byteLength) {
            const newBuf = new ArrayBuffer(this.buf.byteLength + this.growAmt);
            // Copy.
            new Uint8Array(newBuf).set(new Uint8Array(this.buf));
            this.buf = newBuf;
            this.view = new DataView(this.buf);
        }
    }

    copy_buf(buf:ArrayBuffer) {
        this.check_grow(buf.byteLength);
        new Uint8Array(this.buf).set(new Uint8Array(buf), this.offs);
        this.offs += buf.byteLength;
    }

    uint8(c:number) {
        this.check_grow(1);
        this.view.setUint8(this.offs++, c);
    }

    uint32(c:number) {
        this.check_grow(4);
        this.view.setUint32(this.offs, c, true);
        this.offs += 4;
    }

    varuint(c:number, n:number, s:boolean) {
        var cnbits = Math.ceil(Math.log2(c));
        if (cnbits === 0) cnbits = 1;
        // Positive signed values need an extra bit.
        if (c > 0 && s) cnbits++;

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

    varuint1(c:number) { return this.varuint(c, 1, false); }
    varuint7(c:number) { return this.varuint(c, 7, false); }
    varuint32(c:number) { return this.varuint(c, 32, false); }
    varint32(c:number) { return this.varuint(c, 32, true); }

    str(s:String) {
        this.check_grow(s.length);
        for (let i = 0; i < s.length; i++)
            this.view.setUint8(this.offs++, s.charCodeAt(i));
    }

    pstr(s:String) {
        this.varuint32(s.length);
        this.str(s);
    }
}

export class bodywriter {
    w:wasmwriter;
    nparams:number;
    locals:valtype[] = [];

    constructor(nparams:number) {
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
    $u00(c:number) { this.w.uint8(c); }
    $u07(c:number, v:number) { this.$u00(c); this.w.varuint7(v); }
    $u32(c:number, v:number) { this.$u00(c); this.w.varuint32(v); }
    $s32(c:number, v:number) { this.$u00(c); this.w.varint32(v); }

    // Public API.
    $new_local(t:valtype) { return this.nparams + this.locals.push(t) - 1; }

    // Control flow operators.
    unreachable()        { this.$u00(0x00); }
    nop()                { this.$u00(0x01); }
    block(bt:blktype)    { this.$u07(0x02, bt); }
    loop(bt:blktype)     { this.$u07(0x03, bt); }
    if(bt:blktype)       { this.$u07(0x04, bt); }
    else()               { this.$u00(0x05); }
    end()                { this.$u00(0x0b); }
    return()             { this.$u00(0x0f); }

    // Call operators.
    call(idx:number)     { this.$u32(0x10, idx); }
    call_indirect(idx:number) { this.$u32(0x10, idx); this.$u00(0 /* reserved */); }

    // Variable access.
    get_local(m:number)  { this.$u32(0x20, m); }
    set_local(m:number)  { this.$u32(0x21, m); }
    tee_local(m:number)  { this.$u32(0x22, m); }
    get_global(m:number) { this.$u32(0x23, m); }
    set_global(m:number) { this.$u32(0x24, m); }

    // Constants.
    i32_const(v:number)  { this.$s32(0x41, v); }

    // Comparison operators.
    i32_lt_u()           { this.$u00(0x49); }

    // Numeric operators.
    i32_add()            { this.$u00(0x6a); }
    i32_sub()            { this.$u00(0x6b); }
}
