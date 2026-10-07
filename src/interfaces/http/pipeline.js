'use strict';
// Chuỗi lớp chặn: mỗi lớp là (ctx, next) => câu trả lời. Lớp nào không muốn cho qua thì trả luôn, không gọi next.

function compose(layers, last) {
  return function run(ctx) {
    const step = (i) => (i === layers.length ? last(ctx) : layers[i](ctx, () => step(i + 1)));
    return Promise.resolve(step(0));
  };
}

module.exports = { compose };
