import fs from 'fs';
let data = fs.readFileSync('src/App.tsx', 'utf8');

data = data.replace(
  '6. أخرج فقط الكلمات كأنها مكتوبة في نوتة، بدون أي شروحات إضافية وبدون فصحى نهائياً.`;',
  '6. أخرج فقط الكلمات كأنها مكتوبة في نوتة، بدون أي شروحات إضافية وبدون فصحى نهائياً.\n\n${PHONETIC_RULES}`;'
);

fs.writeFileSync('src/App.tsx', data);
