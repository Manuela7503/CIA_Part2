const imagePattern = /^images\/[\w .()-]+\.(?:png|jpe?g|gif|webp)$/i;
export const isImage = value => typeof value === 'string' && imagePattern.test(value);

export function parseQuestions(content) {
  const rows = JSON.parse(content.replace(/^\uFEFF/, ''));
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 12000) throw new Error('The Part 2 question bank is empty or invalid.');
  const ids = new Set();
  for (const q of rows) {
    if (!q || q.type !== 'single_choice' || typeof q.id !== 'string' || ids.has(q.id) ||
        !Number.isInteger(q.unit_number) || q.unit_number < 1 || q.unit_number > 14 ||
        !Number.isInteger(q.subunit_number) || ![q.question, q.unit_title, q.subunit_title].every(v => typeof v === 'string' && v.trim()) ||
        typeof (q.context ?? '') !== 'string' || !['A','B','C','D'].includes(q.correct_answer) ||
        !['A','B','C','D'].every(k => typeof q.options?.[k] === 'string' && q.options[k].trim()) ||
        (q.images != null && (!Array.isArray(q.images) || !q.images.every(isImage)))) {
      throw new Error('Invalid Part 2 question or duplicate question ID.');
    }
    ids.add(q.id);
  }
  return rows;
}
