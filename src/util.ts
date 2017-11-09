
// debugging junk

export function hexdump(b:ArrayBuffer):void {
    function h(c:number, p:number):string {
        let s = c.toString(16);
        while (s.length < p) s = '0' + s;
        return s;
    }

    function hb(a:Uint8Array):string {
        const d = [];
        for (let i = 0; i < a.byteLength; i++)
            d.push(h(a[i], 2));
        return d.join(' ');
    }

    const a = new Uint8Array(b);
    for (let  i = 0; i < a.byteLength; i += 16)
        console.log("%s:  %s", h(i, 4), hb(a.slice(i, i + 16)));
}

export function download(bin:ArrayBuffer, name:string = 'test.wasm') {
    const a = document.createElement('a');
    a.download = name;
    a.href = window.URL.createObjectURL(new Blob([bin], { type: 'application/octet-stream' }));
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

export function load(moduleSource:ArrayBuffer, importsObject:Object = null) {
    // Until TypeScript gains support for WASM, or I figure out
    // how to use declaration files...
    const wasm = (<any> window).WebAssembly;
    const m = new wasm.Module(moduleSource);
    const i = new wasm.Instance(m, importsObject);
    return i;
}
