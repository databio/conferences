// Static OpenAPI 3.1 description of the read API. Kept small and hand-maintained
// so agents/tools can self-configure. Served at GET /openapi.json.
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'conferences.databio.org',
    version: '0.1.0',
    description:
      'AI-curated computational-biology conference + deadline API. Read-only; the dataset is a git-backed JSON file, corrections via GitHub PR.',
  },
  servers: [{ url: 'https://conferences.databio.org' }],
  paths: {
    '/conferences': {
      get: {
        summary: 'List conference instances',
        parameters: [
          { name: 'year', in: 'query', schema: { type: 'integer' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'location', in: 'query', schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'upcoming', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { '200': { description: 'Array of conference instances' } },
      },
    },
    '/deadlines': {
      get: {
        summary: 'Flat, date-sorted deadline feed across all conferences',
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'days', in: 'query', schema: { type: 'integer' } },
          { name: 'kind', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Array of deadline rows' } },
      },
    },
    '/{slug}': { get: { summary: 'A conference series (all tracked years)' } },
    '/{slug}/{year}': { get: { summary: 'One conference instance' } },
    '/calendar.ics': { get: { summary: 'Subscribable iCal of upcoming deadlines' } },
    '/topics': { get: { summary: 'Controlled topic vocabulary' } },
    '/stats': { get: { summary: 'Counts, coverage, last-updated' } },
  },
}
