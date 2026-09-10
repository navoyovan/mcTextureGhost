import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

const iconProps: IconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const IconMinus: React.FC<IconProps> = (props) => (
  <svg {...iconProps} {...props}>
	<path d="M5 12h14" />
  </svg>
);

export const IconMaximize: React.FC<IconProps> = (props) => (
  <svg {...iconProps} {...props}>
	<rect x="5" y="5" width="14" height="14" />
  </svg>
);

export const IconX: React.FC<IconProps> = (props) => (
  <svg {...iconProps} {...props}>
	<path d="M5 5l14 14" />
	<path d="M19 5L5 19" />
  </svg>
);
