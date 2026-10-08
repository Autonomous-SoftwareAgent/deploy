'use strict';
// Giao diện dùng tiếng Anh toàn bộ (người dùng chốt 2026-10-08) và mọi chữ nằm ở text.js: test này giữ hai điều đó.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', 'src', 'interfaces', 'web');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
// Chữ có dấu của tiếng Việt (ngoài chú thích) là dấu hiệu một câu chưa được chuyển sang tiếng Anh.
const VIETNAMESE = /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/i;
const code = (line) => line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '').replace(/\/\*.*?\*\//g, '');

test('giao diện: không câu tiếng Việt nào ngoài chú thích', () => {
  for (const f of files(WEB).filter((x) => !x.endsWith('.css'))) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      assert.ok(!VIETNAMESE.test(code(line)), `${path.relative(WEB, f)}:${i + 1} còn chữ tiếng Việt: ${line.trim().slice(0, 80)}`);
    });
  }
});

test('giao diện: màn hình không tự viết câu chữ, chỉ lấy từ text.js', () => {
  for (const f of files(path.join(WEB, 'views'))) {
    const src = fs.readFileSync(f, 'utf8').split('\n').map(code).join('\n');
    // Một chuỗi có từ hai từ tiếng Anh trở lên cách nhau bằng dấu cách là một câu chữ hiện cho người dùng.
    const literals = src.match(/'[A-Z][a-z]+ [a-z]+[^']*'/g) || [];
    assert.deepEqual(literals, [], `${path.basename(f)} tự viết chữ thay vì lấy từ text.js`);
  }
});
