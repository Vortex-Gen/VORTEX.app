import { TextStyle } from 'react-native';

export const VORTEX_FONT_ASSETS = {
  'AeroMatics-Regular': require('../assets/fonts/Aero Matics Regular.ttf'),
  'AeroMatics-Bold': require('../assets/fonts/Aero Matics Bold.ttf'),
  'AeroMatics-Italic': require('../assets/fonts/Aero Matics Italic.ttf'),
  'AeroMatics-Display': require('../assets/fonts/Aero Matics Display Regular.ttf'),
  'AeroMatics-DisplayBold': require('../assets/fonts/Aero Matics Display Bold.ttf'),
  'DeadlyAdvance': require('../assets/fonts/Deadly Advance.otf'),
  'DeadlyAdvance-Italic': require('../assets/fonts/Deadly Advance Italic.otf'),
  'Ethnocentric': require('../assets/fonts/Ethnocentric-Regular.otf'),
  'GoodTimes': require('../assets/fonts/Good Times Rg.otf'),
  'VerminVibes': require('../assets/fonts/Vermin Vibes.ttf'),
} as const;

export const FontFamily = {
  body: 'AeroMatics-Regular',
  bodyBold: 'AeroMatics-Bold',
  bodyItalic: 'AeroMatics-Italic',
  hud: 'AeroMatics-Display',
  hudBold: 'AeroMatics-DisplayBold',
  alert: 'DeadlyAdvance',
  alertItalic: 'DeadlyAdvance-Italic',
  core: 'Ethnocentric',
  header: 'GoodTimes',
  brand: 'VerminVibes',
} as const;

export const Typography: Record<string, TextStyle> = {
  heroTitle: {
    fontFamily: FontFamily.brand,
    fontSize: 28,
    letterSpacing: 1.5,
  },
  coreStatus: {
    fontFamily: FontFamily.core,
    fontSize: 13,
    letterSpacing: 1.2,
  },
  sectionHeader: {
    fontFamily: FontFamily.header,
    fontSize: 16,
    letterSpacing: 0.8,
  },
  alertBadge: {
    fontFamily: FontFamily.alert,
    fontSize: 12,
    letterSpacing: 1,
  },
  alertTag: {
    fontFamily: FontFamily.alertItalic,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  blockTitle: {
    fontFamily: FontFamily.hudBold,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  hudLabel: {
    fontFamily: FontFamily.hud,
    fontSize: 12,
    letterSpacing: 0.6,
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyBold: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyItalic: {
    fontFamily: FontFamily.bodyItalic,
    fontSize: 14,
    lineHeight: 20,
  },
};
