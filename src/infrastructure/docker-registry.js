'use strict';
// Cổng Registry: hỏi kho xem một bản đã có chưa, bằng `docker manifest inspect` (chỉ hỏi, không kéo về).

function makeDockerRegistry({ run }) {
  return {
    async lookup(remote) {
      const r = run('docker', ['manifest', 'inspect', remote]);
      return { present: r.status === 0, reason: r.status === 0 ? '' : (r.stderr || r.stdout).trim().split('\n').pop() };
    },
  };
}

module.exports = { makeDockerRegistry };
