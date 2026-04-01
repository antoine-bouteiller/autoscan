export const sameIpRecord = {
  result: [{ content: '1.2.3.4', id: 'rec-1', name: 'example.com', ttl: 1, type: 'A' }],
  success: true,
}

export const differentIpRecord = {
  result: [{ content: '5.6.7.8', id: 'rec-1', name: 'example.com', ttl: 1, type: 'A' }],
  success: true,
}

export const emptyRecord = {
  result: [],
  success: true,
}

export const wildcardSameIpRecord = {
  result: [{ content: '1.2.3.4', id: 'rec-2', name: '*.example.com', ttl: 1, type: 'A' }],
  success: true,
}
