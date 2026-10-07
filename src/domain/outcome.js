'use strict';
// Các kết quả có tên của một lần đưa lên. Lớp ngoài đổi mã này thành mã thoát hay mã HTTP; lớp này không biết hai thứ đó.

const OUTCOME = Object.freeze({
  NOT_DECLARED: 'NOT_DECLARED', // dịch vụ chưa khai commit nào
  WAITING_BUILD: 'WAITING_BUILD', // commit đã khai nhưng chưa có bản đóng gói (S-029)
  NO_PREVIOUS: 'NO_PREVIOUS', // sổ chưa ghi bản liền trước
  UNKNOWN_REF: 'UNKNOWN_REF', // không tìm thấy đúng một commit theo tiền tố đã cho
  NEVER_RAN_HERE: 'NEVER_RAN_HERE', // commit chưa từng chạy khỏe trên đích này
  IMAGE_GONE: 'IMAGE_GONE', // bản không còn ở máy lẫn trên kho
  BUSY: 'BUSY', // dịch vụ đang có một lần đưa lên chạy dở
  SWITCH_FAILED: 'SWITCH_FAILED', // bật bản mới không được hoặc không khỏe
  UNEXPECTED: 'UNEXPECTED',
});

module.exports = { OUTCOME };
