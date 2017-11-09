
import { parse } from 'lang';
import { compile } from 'cgen';
import { load } from 'util';

window.onload = function() {
    const source = `
function void print(int n) import;

function int fib(int n) export {
    if (n < 2)
        return n;
    print(n);
    return fib(n - 2) + fib(n - 1);
}
`;

    const m = parse(source);
    const w = compile(m);
    const importsObject = { imports: { print: function(n) { console.log(n); } } };
    const i = load(w, importsObject);
    console.log(i.exports.fib(10));
};
