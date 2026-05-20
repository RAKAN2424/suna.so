import fs from 'fs';
let data = fs.readFileSync('src/App.tsx', 'utf8');

data = data.replace(
  '"rhymes": ["كلمة1", "كلمة2", "كلمة3", "كلمة4", "كلمة5"]\n    }\n\n`;',
  '"rhymes": ["كلمة1", "كلمة2", "كلمة3", "كلمة4", "كلمة5"]\n    }\n\n${PHONETIC_RULES}`;'
);

data = data.replace(
  '4. أخرج السطر الجديد فقط دون أي مقدمات أو شروحات.\n\n`;',
  '4. أخرج السطر الجديد فقط دون أي مقدمات أو شروحات.\n\n${PHONETIC_RULES}`;'
);

fs.writeFileSync('src/App.tsx', data);
