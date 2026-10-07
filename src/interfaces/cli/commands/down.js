'use strict';
// down [--volumes]: tắt các dịch vụ và tầng dùng chung (kèm --volumes thì xóa cả dữ liệu local).
module.exports = {
  name: 'down',
  usage: 'down [--volumes]',
  async run({ app, flags, apply, say }) {
    await app.stack.stop({ apply, volumes: flags.has('volumes'), say });
    return 0;
  },
};
