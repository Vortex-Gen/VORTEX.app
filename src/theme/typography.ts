import * as FileSystem from 'expo-file-system';
import * as Font from 'expo-font';
import { TextStyle } from 'react-native';

export const VORTEX_STORAGE_DIRS = {
  fontsPrimary: 'file:///storage/emulated/0/Vortex/fonts/',
  fontsUpper: 'file:///storage/emulated/0/VORTEX/fonts/',
  appFonts: `${FileSystem.documentDirectory}vortex_fonts/`,
};

export const EXTERNAL_FONT_FILES: Record<string, string> = {
  'AeroMatics-Regular': 'Aero Matics Regular.ttf',
  'AeroMatics-Bold': 'Aero Matics Bold.ttf',
  'AeroMatics-Italic': 'Aero Matics Italic.ttf',
  'AeroMatics-Display': 'Aero Matics Display Regular.ttf',
  'AeroMatics-DisplayBold': 'Aero Matics Display Bold.ttf',
  DeadlyAdvance: 'Deadly Advance.otf',
  'DeadlyAdvance-Italic': 'Deadly Advance Italic.otf',
  Ethnocentric: 'Ethnocentric-Regular.otf',
  GoodTimes: 'Good Times Rg.otf',
  VerminVibes: 'Vermin Vibes.ttf',
};

export async function loadVortexFontsFromStorage(): Promise<Record<string, boolean>> {
  const loadedStatus: Record<string, boolean> = {};
  const fontMapToLoad: Record<string, string> = {};

  for (const [fontFamily, fileName] of Object.entries(EXTERNAL_FONT_FILES)) {
    const encodedName = encodeURIComponent(fileName).replace(/%20/g, ' ');
    const candidates = [
      `${VORTEX_STORAGE_DIRS.fontsPrimary}${encodedName}`,
      `${VORTEX_STORAGE_DIRS.fontsUpper}${encodedName}`,
      `${VORTEX_STORAGE_DIRS.appFonts}${encodedName}`,
    ];

    let foundUri: string | null = null;
    for (const uri of candidates) {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && !info.isDirectory) {
          foundUri = uri;
          break;
        }
      } catch (_e) {
      }
    }

    if (foundUri) {
      fontMapToLoad[fontFamily] = foundUri;
      loadedStatus[fontFamily] = true;
    } else {
      loadedStatus[fontFamily] = false;
    }
  }

  if (Object.keys(fontMapToLoad).length > 0) {
    try {
      await Font.loadAsync(fontMapToLoad);
    } catch (_e) {
    }
  }

  return loadedStatus;
}

export async function importFontFileToVortexStorage(
  pickedUri: string,
  targetFontFamily: keyof typeof EXTERNAL_FONT_FILES
): Promise<boolean> {
  try {
    await FileSystem.makeDirectoryAsync(VORTEX_STORAGE_DIRS.appFonts, { intermediates: true });
    const destUri = `${VORTEX_STORAGE_DIRS.appFonts}${EXTERNAL_FONT_FILES[targetFontFamily]}`;
    await FileSystem.copyAsync({ from: pickedUri, to: destUri });
    await Font.loadAsync({ [targetFontFamily]: destUri });
    return true;
  } catch (_e) {
    return false;
  }
}

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
