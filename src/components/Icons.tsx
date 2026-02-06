// Кастомные SVG иконки для спортивного автомобильного интерфейса

interface IconProps {
  size?: number
  color?: string
}

export const FolderIcon = ({ size = 20, color = 'currentColor' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M3 6.2C3 5.07989 3 4.51984 3.21799 4.09202C3.40973 3.71569 3.71569 3.40973 4.09202 3.21799C4.51984 3 5.0799 3 6.2 3H9.67452C10.1637 3 10.4083 3 10.6385 3.05526C10.8425 3.10425 11.0376 3.18506 11.2166 3.29472C11.4184 3.4184 11.5914 3.59135 11.9373 3.93726L12.0627 4.06274C12.4086 4.40865 12.5816 4.5816 12.7834 4.70528C12.9624 4.81494 13.1575 4.89575 13.3615 4.94474C13.5917 5 13.8363 5 14.3255 5H17.8C18.9201 5 19.4802 5 19.908 5.21799C20.2843 5.40973 20.5903 5.71569 20.782 6.09202C21 6.51984 21 7.0799 21 8.2V8M3 6.2V15.8C3 16.9201 3 17.4802 3.21799 17.908C3.40973 18.2843 3.71569 18.5903 4.09202 18.782C4.51984 19 5.07989 19 6.2 19H17.8C18.9201 19 19.4802 19 19.908 18.782C20.2843 18.5903 20.5903 18.2843 20.782 17.908C21 17.4802 21 16.9201 21 15.8V8" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const MapIcon = ({ size = 20, color = 'currentColor' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M9 18L3 15V5L9 8M9 18L15 21M9 18V8M15 21L21 18V8L15 5M15 21V11M15 5L9 8" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const ResetIcon = ({ size = 20, color = 'currentColor' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C14.8273 3 17.35 4.30367 19 6.34267M19 3V6.34267M19 6.34267H15.6573" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const BugIcon = ({ size = 20, color = 'currentColor' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M8 2V5M16 2V5M3.5 14.5H7M17 14.5H20.5M3.5 9.5H7M17 9.5H20.5M9 18C9 19.1046 10.3431 20 12 20C13.6569 20 15 19.1046 15 18M9 18C9 16.8954 10.3431 16 12 16C13.6569 16 15 16.8954 15 16M9 18V11M15 18V11M9 11C9 9.89543 10.3431 9 12 9C13.6569 9 15 9.89543 15 9M9 11C9 12.1046 10.3431 13 12 13C13.6569 13 15 12.1046 15 13M15 11V9M9 11V9M9 9C9 7.34315 10.3431 6 12 6C13.6569 6 15 7.34315 15 9M5 5L7.5 7M19 5L16.5 7M5 19L7.5 17M19 19L16.5 17" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const SpeedometerIcon = ({ size = 20, color = 'currentColor' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <path 
      d="M14.8284 9.17157L12 12M3.51472 12.5C3.18145 11.7004 3 10.8253 3 9.91668C3 5.57869 6.57869 2 10.9167 2C15.2547 2 18.8333 5.57869 18.8333 9.91668C18.8333 10.8253 18.6519 11.7004 18.3186 12.5M5 16H19C19.5523 16 20 16.4477 20 17V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V17C4 16.4477 4.44772 16 5 16Z" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

export const RacingFlagIcon = ({ size = 20, color = 'currentColor' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Древко флага */}
    <rect x="3" y="3" width="2" height="18" fill={color} />
    
    {/* Клетчатый флаг - 4x3 клетки */}
    {/* Первый ряд */}
    <rect x="5" y="4" width="4" height="3" fill={color} />
    <rect x="9" y="4" width="4" height="3" fill="none" stroke={color} strokeWidth="0.5" />
    <rect x="13" y="4" width="4" height="3" fill={color} />
    <rect x="17" y="4" width="4" height="3" fill="none" stroke={color} strokeWidth="0.5" />
    
    {/* Второй ряд */}
    <rect x="5" y="7" width="4" height="3" fill="none" stroke={color} strokeWidth="0.5" />
    <rect x="9" y="7" width="4" height="3" fill={color} />
    <rect x="13" y="7" width="4" height="3" fill="none" stroke={color} strokeWidth="0.5" />
    <rect x="17" y="7" width="4" height="3" fill={color} />
    
    {/* Третий ряд */}
    <rect x="5" y="10" width="4" height="3" fill={color} />
    <rect x="9" y="10" width="4" height="3" fill="none" stroke={color} strokeWidth="0.5" />
    <rect x="13" y="10" width="4" height="3" fill={color} />
    <rect x="17" y="10" width="4" height="3" fill="none" stroke={color} strokeWidth="0.5" />
    
    {/* Четвертый ряд */}
    <rect x="5" y="13" width="4" height="3" fill="none" stroke={color} strokeWidth="0.5" />
    <rect x="9" y="13" width="4" height="3" fill={color} />
    <rect x="13" y="13" width="4" height="3" fill="none" stroke={color} strokeWidth="0.5" />
    <rect x="17" y="13" width="4" height="3" fill={color} />
    
    {/* Рамка флага */}
    <rect x="5" y="4" width="16" height="12" fill="none" stroke={color} strokeWidth="1" />
  </svg>
)
