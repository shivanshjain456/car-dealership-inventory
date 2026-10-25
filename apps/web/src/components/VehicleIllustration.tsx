import type { VehicleDto } from '@motorline/contracts';

const PALETTE = ['#1d6650', '#bc6346', '#c3a363', '#4e6880', '#3b4140', '#9e664e'];

function paintFor(make: string): string {
  const hash = Array.from(make).reduce((total, character) => total + character.charCodeAt(0), 0);
  return PALETTE[hash % PALETTE.length]!;
}

export default function VehicleIllustration({ vehicle }: { vehicle: VehicleDto }) {
  const paint = paintFor(vehicle.make);
  const category = vehicle.category.toLowerCase();
  const roofTop = category.includes('coupe') ? 58 : category.includes('electric') ? 44 : 50;
  const bodyPath = `M34 143c8-21 25-36 49-42l47-9 35-31c9-8 19-12 32-12h76c19 0 33 7 45 22l33 38 39 10c11 3 18 11 21 22l3 14H29l5-12Z`;
  const windowPath = `M139 90 173 ${roofTop} Q184 ${roofTop - 7} 198 ${roofTop - 7} H270 Q285 ${roofTop - 7} 296 ${roofTop + 8} L319 90Z`;

  return (
    <svg
      className="vehicle-illustration"
      viewBox="0 0 440 190"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M22 166h396" className="car-ground" />
      <ellipse cx="225" cy="156" rx="157" ry="12" className="car-shadow" />
      <path d={bodyPath} fill={paint} className="car-body" />
      <path d={windowPath} className="car-windows" />
      <path d={`M270 ${roofTop - 7}v40m-82 0h167`} className="car-window-divider" />
      <path d="M41 132h35m299 0h27" className="car-trim" />
      <path d="M40 127h20m352 0h16" className="car-light" />
      <circle cx="121" cy="151" r="24" className="car-tyre" />
      <circle cx="121" cy="151" r="11" className="car-wheel" />
      <circle cx="341" cy="151" r="24" className="car-tyre" />
      <circle cx="341" cy="151" r="11" className="car-wheel" />
      <path d="M113 151h16m204 0h16" className="car-hub" />
    </svg>
  );
}
