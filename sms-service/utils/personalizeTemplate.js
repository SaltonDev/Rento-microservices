function personalize(template, tenant) {
  return template
    .replace(/{{name}}/g, tenant.name)
    .replace(/{{amount}}/g, tenant.amount)
    .replace(/{{due_date}}/g, tenant.due_date);
}

module.exports = personalize;
