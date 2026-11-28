import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';

export type VortexIconName =
  | 'menu'
  | 'chevronDown'
  | 'chevronRight'
  | 'arrowLeft'
  | 'arrowUp'
  | 'close'
  | 'plus'
  | 'moreHorizontal'
  | 'moreVertical'
  | 'search'
  | 'pin'
  | 'filter'
  | 'trash'
  | 'edit'
  | 'check'
  | 'checkCircle'
  | 'alertCircle'
  | 'shield'
  | 'shieldLock'
  | 'vortexCore'
  | 'newChat'
  | 'chatBubble'
  | 'branch'
  | 'phoneMock'
  | 'image'
  | 'camera'
  | 'folder'
  | 'ghost'
  | 'sparkles'
  | 'diagram'
  | 'graduationCap'
  | 'notebook'
  | 'waveform'
  | 'mic'
  | 'micOff'
  | 'volume'
  | 'volumeMute'
  | 'clock'
  | 'alarm'
  | 'bolt'
  | 'rocket'
  | 'sliders'
  | 'sun'
  | 'cpu'
  | 'key'
  | 'pcBridge'
  | 'wifiOff'
  | 'copy'
  | 'inject'
  | 'keyboard'
  | 'expand'
  | 'play'
  | 'pause'
  | 'stop'
  | 'crosshair'
  | 'screenShare'
  | 'clipboard'
  | 'workflow'
  | 'reply'
  | 'settings'
  | 'battery'
  | 'torch'
  | 'send';

export interface VortexIconProps {
  name: VortexIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
}

export const VortexIcon: React.FC<VortexIconProps> = ({
  name,
  size = 20,
  color = '#F8FAFC',
  strokeWidth = 1.85,
  filled = false,
}) => {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 20;
  const sw = Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 1.85;
  const fillVal = filled ? color : 'none';

  switch (name) {
    case 'menu':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="4" y1="9" x2="20" y2="9" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="4" y1="15" x2="15" y2="15" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'chevronDown':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M6 9L12 15L18 9" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'chevronRight':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M9 6L15 12L9 18" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'arrowLeft':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="19" y1="12" x2="5" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M11 6L5 12L11 18" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'arrowUp':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="12" y1="19" x2="12" y2="5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M6 11L12 5L18 11" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'close':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'plus':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'moreHorizontal':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="6" cy="12" r="1.5" fill={color} />
          <Circle cx="12" cy="12" r="1.5" fill={color} />
          <Circle cx="18" cy="12" r="1.5" fill={color} />
        </Svg>
      );

    case 'moreVertical':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="6" r="1.5" fill={color} />
          <Circle cx="12" cy="12" r="1.5" fill={color} />
          <Circle cx="12" cy="18" r="1.5" fill={color} />
        </Svg>
      );

    case 'search':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth={sw} />
          <Line x1="16" y1="16" x2="20.5" y2="20.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'pin':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill={fillVal}>
          <Path
            d="M15 4.5L19.5 9L16 12.5L16.5 16L13.5 13L8.5 18L6 15.5L11 10.5L8 7.5L11.5 8L15 4.5Z"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Line x1="4" y1="20" x2="7.2" y2="16.8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'filter':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="4" y1="7" x2="20" y2="7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="7" y1="12" x2="17" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="10" y1="17" x2="14" y2="17" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'trash':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="4" y1="6.5" x2="20" y2="6.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M9 6.5V4.5C9 3.95 9.45 3.5 10 3.5H14C14.55 3.5 15 3.95 15 4.5V6.5" stroke={color} strokeWidth={sw} />
          <Path d="M6.5 6.5L7.5 19.5C7.55 20.05 8 20.5 8.55 20.5H15.45C16 20.5 16.45 20.05 16.5 19.5L17.5 6.5" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'edit':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M12 4H6C4.9 4 4 4.9 4 6V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M16.5 3.5L20.5 7.5L11.5 16.5H7.5V12.5L16.5 3.5Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'check':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M5 12.5L9.5 17L19 7" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'checkCircle':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
          <Path d="M8.5 12.2L10.8 14.5L15.8 9.5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'alertCircle':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
          <Line x1="12" y1="8" x2="12" y2="12.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx="12" cy="16" r="1" fill={color} />
        </Svg>
      );

    case 'shield':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill={fillVal}>
          <Path d="M12 3L19 6V11.5C19 16.2 16 20.1 12 21.5C8 20.1 5 16.2 5 11.5V6L12 3Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'shieldLock':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M12 3L19 6V11.5C19 16.2 16 20.1 12 21.5C8 20.1 5 16.2 5 11.5V6L12 3Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Rect x="9.5" y="11" width="5" height="4.2" rx="1" stroke={color} strokeWidth={1.6} />
          <Path d="M10.5 11V9.5C10.5 8.67 11.17 8 12 8C12.83 8 13.5 8.67 13.5 9.5V11" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      );

    case 'vortexCore':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth={sw} />
          <Path
            d="M9.5 18V8.5C9.5 6.8 10.8 5.5 12.5 5.5C14 5.5 15.2 6.5 15.2 7.9C15.2 9.1 14.3 10.1 13.1 10.4C14.7 10.7 15.8 12 15.8 13.6C15.8 15.5 14.2 16.8 12.3 16.8H11.5"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );

    case 'newChat':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M12 4H7C5.34 4 4 5.34 4 7V15C4 16.66 5.34 18 7 18H9L12 21L15 18H17C18.66 18 20 16.66 20 15V12" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="18" y1="3.5" x2="18" y2="8.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="15.5" y1="6" x2="20.5" y2="6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'chatBubble':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M6 5H18C19.1 5 20 5.9 20 7V15C20 16.1 19.1 17 18 17H9L5 20.5V7C5 5.9 5.9 5 7 5" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'branch':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="7" cy="6" r="2.2" stroke={color} strokeWidth={sw} />
          <Circle cx="7" cy="18" r="2.2" stroke={color} strokeWidth={sw} />
          <Circle cx="17" cy="10" r="2.2" stroke={color} strokeWidth={sw} />
          <Line x1="7" y1="8.2" x2="7" y2="15.8" stroke={color} strokeWidth={sw} />
          <Path d="M7 13C7 10.8 8.8 10 11 10H14.8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'phoneMock':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4" stroke={color} strokeWidth={sw} />
          <Line x1="10.5" y1="5.5" x2="13.5" y2="5.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Circle cx="12" cy="17.8" r="0.9" fill={color} />
        </Svg>
      );

    case 'image':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke={color} strokeWidth={sw} />
          <Circle cx="8.8" cy="9.5" r="1.4" fill={color} />
          <Path d="M4.5 17.5L9.5 12.8L13 16L16 13.5L19.5 17.5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'camera':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M4 8.5C4 7.4 4.9 6.5 6 6.5H8L9.5 4.5H14.5L16 6.5H18C19.1 6.5 20 7.4 20 8.5V17.5C20 18.6 19.1 19.5 18 19.5H6C4.9 19.5 4 18.6 4 17.5V8.5Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="12" cy="13" r="3.2" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'folder':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M3.5 7C3.5 5.9 4.4 5 5.5 5H9.5L11.5 7H18.5C19.6 7 20.5 7.9 20.5 9V17C20.5 18.1 19.6 19 18.5 19H5.5C4.4 19 3.5 18.1 3.5 17V7Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'ghost':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M6 19.5V10.5C6 7.19 8.69 4.5 12 4.5C15.31 4.5 18 7.19 18 10.5V19.5L15.6 17.8L13.8 19.5L12 17.8L10.2 19.5L8.4 17.8L6 19.5Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="10" cy="11" r="1.1" fill={color} />
          <Circle cx="14" cy="11" r="1.1" fill={color} />
        </Svg>
      );

    case 'sparkles':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M12 3L13.9 8.6L19.5 10.5L13.9 12.4L12 18L10.1 12.4L4.5 10.5L10.1 8.6L12 3Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Line x1="18.5" y1="15.5" x2="18.5" y2="19.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="16.5" y1="17.5" x2="20.5" y2="17.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'diagram':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="8.5" y="3.5" width="7" height="4.5" rx="1.2" stroke={color} strokeWidth={sw} />
          <Rect x="3.5" y="16" width="6.5" height="4.5" rx="1.2" stroke={color} strokeWidth={sw} />
          <Rect x="14" y="16" width="6.5" height="4.5" rx="1.2" stroke={color} strokeWidth={sw} />
          <Line x1="12" y1="8" x2="12" y2="12" stroke={color} strokeWidth={sw} />
          <Path d="M6.8 16V12H17.2V16" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'graduationCap':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Polygon points="12,4.5 21.5,9.2 12,13.9 2.5,9.2" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M6.5 11.8V16.2C6.5 17.8 9 19.2 12 19.2C15 19.2 17.5 17.8 17.5 16.2V11.8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="20.5" y1="9.8" x2="20.5" y2="15.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'notebook':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="5.5" y="3.5" width="14" height="17" rx="2" stroke={color} strokeWidth={sw} />
          <Line x1="9" y1="3.5" x2="9" y2="20.5" stroke={color} strokeWidth={sw} />
          <Line x1="12" y1="8.5" x2="16.5" y2="8.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1="12" y1="12.5" x2="16.5" y2="12.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      );

    case 'waveform':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="4" y1="10" x2="4" y2="14" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="8" y1="6.5" x2="8" y2="17.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="12" y1="4" x2="12" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="16" y1="7.5" x2="16" y2="16.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="20" y1="10" x2="20" y2="14" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'mic':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="9" y="3.5" width="6" height="10" rx="3" stroke={color} strokeWidth={sw} />
          <Path d="M5.5 11.5C5.5 15.09 8.41 18 12 18C15.59 18 18.5 15.09 18.5 11.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="12" y1="18" x2="12" y2="21" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'micOff':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="9" y="3.5" width="6" height="10" rx="3" stroke={color} strokeWidth={sw} />
          <Path d="M5.5 11.5C5.5 15.09 8.41 18 12 18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="4" y1="4" x2="20" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'volume':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Polygon points="4,9.5 8.5,9.5 13.5,5.5 13.5,18.5 8.5,14.5 4,14.5" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M16.5 9C17.6 10.1 17.6 13.9 16.5 15" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M19 6.5C21 8.8 21 15.2 19 17.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'volumeMute':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Polygon points="4,9.5 8.5,9.5 13.5,5.5 13.5,18.5 8.5,14.5 4,14.5" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Line x1="16.5" y1="9.5" x2="20.5" y2="14.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="20.5" y1="9.5" x2="16.5" y2="14.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'clock':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth={sw} />
          <Path d="M12 7.5V12L15.2 14" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'alarm':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="13" r="7.5" stroke={color} strokeWidth={sw} />
          <Path d="M12 9V13L14.8 14.6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M4.5 6.5L7.5 4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M19.5 6.5L16.5 4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'bolt':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill={fillVal}>
          <Polygon points="13,3 5.5,13.5 11.5,13.5 10.5,21 18.5,10.5 12.5,10.5" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'rocket':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M14.5 4.5C17.8 4.5 19.5 6.2 19.5 9.5C19.5 13 15.5 16.5 12 18L6 12C7.5 8.5 11 4.5 14.5 4.5Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="14.5" cy="9.5" r="1.4" fill={color} />
          <Path d="M6 15L4.5 19.5L9 18" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'sliders':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Line x1="4" y1="7" x2="20" y2="7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx="9" cy="7" r="2.2" fill="#000000" stroke={color} strokeWidth={sw} />
          <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx="15" cy="12" r="2.2" fill="#000000" stroke={color} strokeWidth={sw} />
          <Line x1="4" y1="17" x2="20" y2="17" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx="10.5" cy="17" r="2.2" fill="#000000" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'sun':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth={sw} />
          <Line x1="12" y1="3" x2="12" y2="5.2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="12" y1="18.8" x2="12" y2="21" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="3" y1="12" x2="5.2" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="18.8" y1="12" x2="21" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="5.6" y1="5.6" x2="7.2" y2="7.2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="16.8" y1="16.8" x2="18.4" y2="18.4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="18.4" y1="5.6" x2="16.8" y2="7.2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="7.2" y1="16.8" x2="5.6" y2="18.4" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'cpu':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="6.5" y="6.5" width="11" height="11" rx="2" stroke={color} strokeWidth={sw} />
          <Rect x="9.5" y="9.5" width="5" height="5" rx="0.8" stroke={color} strokeWidth={1.5} />
          <Line x1="9" y1="3.5" x2="9" y2="6.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="15" y1="3.5" x2="15" y2="6.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="9" y1="17.5" x2="9" y2="20.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="15" y1="17.5" x2="15" y2="20.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="3.5" y1="9" x2="6.5" y2="9" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="3.5" y1="15" x2="6.5" y2="15" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="17.5" y1="9" x2="20.5" y2="9" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="17.5" y1="15" x2="20.5" y2="15" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'key':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="8.2" cy="14.5" r="3.8" stroke={color} strokeWidth={sw} />
          <Path d="M11.2 11.8L19.5 4.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M16.5 7.2L19 9.7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M18.8 5.2L20.8 7.2" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'pcBridge':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="4" y="4" width="16" height="10.5" rx="2" stroke={color} strokeWidth={sw} />
          <Line x1="8" y1="18.5" x2="16" y2="18.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="12" y1="14.5" x2="12" y2="18.5" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'wifiOff':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M4.5 9.5C8.8 6.2 15.2 6.2 19.5 9.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M7.8 13C10.3 11.1 13.7 11.1 16.2 13" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx="12" cy="17.2" r="1.3" fill={color} />
          <Line x1="4" y1="4.5" x2="20" y2="19.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'copy':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="8.5" y="8.5" width="11" height="11" rx="2" stroke={color} strokeWidth={sw} />
          <Path d="M15.5 8.5V6.5C15.5 5.4 14.6 4.5 13.5 4.5H6.5C5.4 4.5 4.5 5.4 4.5 6.5V13.5C4.5 14.6 5.4 15.5 6.5 15.5H8.5" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'inject':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M14.5 4.5L19.5 9.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M16.5 6.5L8 15L6 18L9 16L17.5 7.5" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Line x1="4" y1="20" x2="6.5" y2="17.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'keyboard':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="3" y="6" width="18" height="12" rx="2.2" stroke={color} strokeWidth={sw} />
          <Line x1="7" y1="10" x2="8.5" y2="10" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="11.2" y1="10" x2="12.8" y2="10" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="15.5" y1="10" x2="17" y2="10" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="8" y1="14" x2="16" y2="14" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'expand':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M14.5 4.5H19.5V9.5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="19.5" y1="4.5" x2="13.5" y2="10.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M9.5 19.5H4.5V14.5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="4.5" y1="19.5" x2="10.5" y2="13.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'play':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill={fillVal}>
          <Polygon points="7,5 19,12 7,19" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );

    case 'pause':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="6.5" y="5" width="3.8" height="14" rx="1" stroke={color} strokeWidth={sw} />
          <Rect x="13.7" y="5" width="3.8" height="14" rx="1" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'stop':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill={fillVal}>
          <Rect x="6" y="6" width="12" height="12" rx="2" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'crosshair':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="7" stroke={color} strokeWidth={sw} />
          <Circle cx="12" cy="12" r="2" fill={color} />
          <Line x1="12" y1="2.5" x2="12" y2="6.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="12" y1="17.5" x2="12" y2="21.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="2.5" y1="12" x2="6.5" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="17.5" y1="12" x2="21.5" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'screenShare':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="3.5" y="5" width="17" height="12" rx="2" stroke={color} strokeWidth={sw} />
          <Path d="M12 13.5V8.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M9.5 10.8L12 8.3L14.5 10.8" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="8.5" y1="19.5" x2="15.5" y2="19.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'clipboard':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="5.5" y="5" width="13" height="15.5" rx="2" stroke={color} strokeWidth={sw} />
          <Rect x="9" y="3" width="6" height="3.5" rx="1" stroke={color} strokeWidth={sw} />
          <Path d="M9 13L11.2 15.2L15.5 10.8" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'workflow':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="3.5" y="4.5" width="6.5" height="5" rx="1.2" stroke={color} strokeWidth={sw} />
          <Rect x="14" y="14.5" width="6.5" height="5" rx="1.2" stroke={color} strokeWidth={sw} />
          <Path d="M10 7H14.5C15.88 7 17 8.12 17 9.5V14.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M14.8 12.5L17 14.7L19.2 12.5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'reply':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M9 8L4.5 12.5L9 17" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M4.5 12.5H14.5C17.26 12.5 19.5 14.74 19.5 17.5V19" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'settings':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={sw} />
          <Path
            d="M19.4 15A1.65 1.65 0 0 0 19.73 16.82L19.79 16.88A2 2 0 1 1 16.96 19.71L16.9 19.65A1.65 1.65 0 0 0 15.08 19.32A1.65 1.65 0 0 0 14.08 20.83V21A2 2 0 1 1 10.08 21V20.91A1.65 1.65 0 0 0 9 19.4A1.65 1.65 0 0 0 7.18 19.73L7.12 19.79A2 2 0 1 1 4.29 16.96L4.35 16.9A1.65 1.65 0 0 0 4.68 15.08A1.65 1.65 0 0 0 3.17 14.08H3A2 2 0 1 1 3 10.08H3.09A1.65 1.65 0 0 0 4.6 9A1.65 1.65 0 0 0 4.27 7.18L4.21 7.12A2 2 0 1 1 7.04 4.29L7.1 4.35A1.65 1.65 0 0 0 8.92 4.68H9A1.65 1.65 0 0 0 10 3.17V3A2 2 0 1 1 14 3V3.09A1.65 1.65 0 0 0 15 4.6A1.65 1.65 0 0 0 16.82 4.27L16.88 4.21A2 2 0 1 1 19.71 7.04L19.65 7.1A1.65 1.65 0 0 0 19.32 8.92V9A1.65 1.65 0 0 0 20.83 10H21A2 2 0 1 1 21 14H20.91A1.65 1.65 0 0 0 19.4 15Z"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        </Svg>
      );

    case 'battery':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Rect x="3.5" y="7" width="15.5" height="10" rx="2" stroke={color} strokeWidth={sw} />
          <Line x1="21" y1="10.2" x2="21" y2="13.8" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Rect x="6" y="9.5" width="8.5" height="5" rx="0.8" fill={color} />
        </Svg>
      );

    case 'torch':
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M8 4H16L14.5 9V19C14.5 19.55 14.05 20 13.5 20H10.5C9.95 20 9.5 19.55 9.5 19V9L8 4Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Circle cx="12" cy="13" r="1.2" fill={color} />
        </Svg>
      );

    case 'send':
    default:
      return (
        <Svg width={safeSize} height={safeSize} viewBox="0 0 24 24" fill="none">
          <Path d="M20 4L10.5 13.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Polygon points="20,4 14,20 10.5,13.5 4,10" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
        </Svg>
      );
  }
};
type NamedIconProps = {
  size?: number;
  color?: string;
};

export const CheckIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="check" size={size} color={color} />
);

export const CodeBracketsIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="code" size={size} color={color} />
);

export const CopyIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="copy" size={size} color={color} />
);

export const DownloadIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="download" size={size} color={color} />
);

export const ExpandIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="expand" size={size} color={color} />
);

export const ExternalLinkIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="external_link" size={size} color={color} />
);

export const GhostHandIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="ghost" size={size} color={color} />
);

export const InjectBoltIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="inject" size={size} color={color} />
);

export const SparklesIcon = ({ size = 16, color = '#F8FAFC' }: NamedIconProps) => (
  <VortexIcon name="sparkles" size={size} color={color} />
); 
