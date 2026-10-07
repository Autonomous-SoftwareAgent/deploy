// Hộp hỏi lại trước một việc làm thay đổi hệ. Dùng phần tử <dialog> của trình duyệt (bàn phím và tiêu điểm do trình duyệt lo).

export function createConfirm(doc = document) {
  const dialog = doc.getElementById('confirm');
  /** question: { title, text, yes }. Trả Promise<boolean>. */
  return function confirm({ title, text, yes }) {
    doc.getElementById('confirmTitle').textContent = title;
    doc.getElementById('confirmText').textContent = text;
    doc.getElementById('confirmYes').textContent = yes;
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
      dialog.returnValue = 'no';
      dialog.showModal();
    });
  };
}
