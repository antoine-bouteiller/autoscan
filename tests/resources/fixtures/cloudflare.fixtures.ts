export const sameIpRecord = {
  result: [{ id: 'rec-1', name: 'example.com', content: '1.2.3.4', ttl: 1, type: 'A' }],
  success: true,
}

export const differentIpRecord = {
  result: [{ id: 'rec-1', name: 'example.com', content: '5.6.7.8', ttl: 1, type: 'A' }],
  success: true,
}

export const emptyRecord = {
  result: [],
  success: true,
}

export const wildcardSameIpRecord = {
  result: [{ id: 'rec-2', name: '*.example.com', content: '1.2.3.4', ttl: 1, type: 'A' }],
  success: true,
}
