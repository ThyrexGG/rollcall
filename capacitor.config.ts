import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.camtech.rollcall',
  appName: 'Rollcall',
  webDir: 'dist',
  android: { backgroundColor: '#0E1E33' },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
}

export default config
