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
	<path d="M8 4H4v4" />
	<path d="M4 4l5 5" />
	<path d="M16 4h4v4" />
	<path d="M20 4l-5 5" />
	<path d="M8 20H4v-4" />
	<path d="M4 20l5-5" />
	<path d="M16 20h4v-4" />
	<path d="M20 20l-5-5" />
  </svg>
);

export const IconX: React.FC<IconProps> = (props) => (
  <svg {...iconProps} {...props}>
	<path d="M18 6 6 18" />
	<path d="m6 6 12 12" />
  </svg>
);
