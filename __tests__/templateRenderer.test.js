const renderTemplate = require('../utils/templateRenderer');

describe('Template Renderer', () => {
  test('should render simple template with data', () => {
    const template = 'Hello {{name}}!';
    const data = { name: 'World' };
    expect(renderTemplate(template, data)).toBe('Hello World!');
  });

  test('should render template with nested objects', () => {
    const template = '{{user.name}} is {{user.age}} years old';
    const data = { user: { name: 'John', age: 30 } };
    expect(renderTemplate(template, data)).toBe('John is 30 years old');
  });

  test('should render template with arrays using each', () => {
    const template = '{{#each items}}{{this}}{{/each}}';
    const data = { items: [1, 2, 3] };
    expect(renderTemplate(template, data)).toBe('123');
  });
});
