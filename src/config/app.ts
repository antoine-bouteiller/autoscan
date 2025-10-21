export const appConfig = {
  cleanup: {
    strikeCount: 5,
  },
  server: {
    port: 3030,
  },
  transcode: {
    audio: {
      wantedEncodings: ['aac', 'ac3', 'eac3'],
    },
    subtitle: {
      wantedEncodings: ['subrip', 'ass'],
    },
  },
}
