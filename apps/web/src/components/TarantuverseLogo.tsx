import * as React from "react";

type Props = React.SVGProps<SVGSVGElement>;

export function TarantuverseLogoDark(props: Props) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="Tarantuverse logo"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="512" x2="1024" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--user-primary-hex, #5C32FF)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--user-secondary-hex, #FD22D9)' }} />
        </linearGradient>

        <linearGradient id="spiderGrad" x1="512" y1="300" x2="512" y2="740" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--user-secondary-hex, #E72BF8)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--user-primary-hex, #B734FF)' }} />
        </linearGradient>

        <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id="bgGlow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" style={{ stopColor: 'var(--user-secondary-hex, #E72BF8)', stopOpacity: 0.18 }} />
          <stop offset="55%" style={{ stopColor: 'var(--user-primary-hex, #5C32FF)', stopOpacity: 0.10 }} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0} />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="1024" height="1024" fill="url(#bgGlow)" />

      <g filter="url(#softGlow)">
        <circle cx="512" cy="512" r="337" fill="none" stroke="url(#ringGrad)" strokeWidth="30" />
        <path d="M 410.0 273.0 L 382.0 388.0 L 446.0 481.0 L 390.0 470.0 L 315.0 406.0 L 300.0 419.0 L 373.0 484.0 L 446.0 510.0 L 362.0 555.0 L 327.0 650.0 L 345.0 653.0 L 383.0 562.0 L 444.0 534.0 L 394.0 626.0 L 403.0 742.0 L 422.0 741.0 L 413.0 638.0 L 429.0 594.0 L 459.0 657.0 L 503.0 681.0 L 554.0 667.0 L 594.0 596.0 L 610.0 645.0 L 600.0 739.0 L 614.0 747.0 L 629.0 689.0 L 628.0 626.0 L 577.0 535.0 L 637.0 560.0 L 679.0 653.0 L 691.0 657.0 L 696.0 642.0 L 658.0 553.0 L 576.0 503.0 L 648.0 484.0 L 721.0 412.0 L 705.0 407.0 L 627.0 472.0 L 576.0 482.0 L 641.0 382.0 L 616.0 280.0 L 602.0 272.0 L 595.0 284.0 L 620.0 382.0 L 595.0 425.0 L 572.0 438.0 L 560.0 415.0 L 564.0 378.0 L 549.0 356.0 L 544.0 396.0 L 478.0 396.0 L 474.0 356.0 L 458.0 381.0 L 462.0 415.0 L 442.0 441.0 L 402.0 381.0 L 427.0 284.0 Z" fill="url(#spiderGrad)" />
      </g>
    </svg>
  );
}

export function TarantuverseLogoTransparent(props: Props) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="Tarantuverse logo"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="ringGrad2" x1="0" y1="512" x2="1024" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--user-primary-hex, #5C32FF)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--user-secondary-hex, #FD22D9)' }} />
        </linearGradient>

        <linearGradient id="spiderGrad2" x1="512" y1="300" x2="512" y2="740" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: 'var(--user-secondary-hex, #E72BF8)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--user-primary-hex, #B734FF)' }} />
        </linearGradient>

        <filter id="softGlow2" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#softGlow2)">
        <circle cx="512" cy="512" r="337" fill="none" stroke="url(#ringGrad2)" strokeWidth="30" />
        <path d="M 410.0 273.0 L 382.0 388.0 L 446.0 481.0 L 390.0 470.0 L 315.0 406.0 L 300.0 419.0 L 373.0 484.0 L 446.0 510.0 L 362.0 555.0 L 327.0 650.0 L 345.0 653.0 L 383.0 562.0 L 444.0 534.0 L 394.0 626.0 L 403.0 742.0 L 422.0 741.0 L 413.0 638.0 L 429.0 594.0 L 459.0 657.0 L 503.0 681.0 L 554.0 667.0 L 594.0 596.0 L 610.0 645.0 L 600.0 739.0 L 614.0 747.0 L 629.0 689.0 L 628.0 626.0 L 577.0 535.0 L 637.0 560.0 L 679.0 653.0 L 691.0 657.0 L 696.0 642.0 L 658.0 553.0 L 576.0 503.0 L 648.0 484.0 L 721.0 412.0 L 705.0 407.0 L 627.0 472.0 L 576.0 482.0 L 641.0 382.0 L 616.0 280.0 L 602.0 272.0 L 595.0 284.0 L 620.0 382.0 L 595.0 425.0 L 572.0 438.0 L 560.0 415.0 L 564.0 378.0 L 549.0 356.0 L 544.0 396.0 L 478.0 396.0 L 474.0 356.0 L 458.0 381.0 L 462.0 415.0 L 442.0 441.0 L 402.0 381.0 L 427.0 284.0 Z" fill="url(#spiderGrad2)" />
      </g>
    </svg>
  );
}
