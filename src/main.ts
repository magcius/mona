
import { parse } from 'lang';
import { compile } from 'cgen';
import { load } from 'util';

window.onload = function() {
    const source = `
function int fib(int n) export {
    if (n < 2)
        return n;
    return fib(n - 2) + fib(n - 1);
}
`;

    const m = parse(source);
    const w = compile(m);
    const i = load(w);
    console.log(i.exports.fib(10));
};
