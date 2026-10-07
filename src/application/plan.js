'use strict';
// Một kế hoạch là danh sách bước {text, run()}. Lệnh làm thay đổi mặc định chỉ in kế hoạch; apply mới chạy từng bước.

async function runPlan(steps, { apply, say }) {
  for (const [i, step] of steps.entries()) {
    say(`${apply ? '' : '(kế hoạch) '}${i + 1}. ${step.text}`);
    if (apply) await step.run();
  }
  if (!apply) say('Chưa làm gì. Thêm --apply để chạy thật.');
}

/** Chạy các bước con của một bước lớn, mỗi bước in một dòng thụt vào. */
async function runSubSteps(steps, say) {
  for (const step of steps) { say(`   - ${step.text}`); await step.run(); }
}

module.exports = { runPlan, runSubSteps };
