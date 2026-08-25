import { useEffect, useState } from "react";

const EXPRESSIONS = {
  idle: {
    head: { x: 7.3, y: 27.8, z: -16.1 },
    eyes: {
      left: { width: 22.5, height: 42.38, x: 0, y: -20.5, angle: 0 },
      right: { width: 22.5, height: 42.38, x: 0, y: -20.5, angle: 0 },
      spacing: 54.3,
    },
  },
  curious: {
    head: { x: -12.3, y: -17.6, z: 5.91 },
    eyes: {
      left: { width: 20.61, height: 47.77, x: 0, y: 0, angle: 23.52 },
      right: { width: 20.61, height: 47.77, x: 0, y: 0, angle: -24.04 },
      spacing: 54.9,
    },
  },
  thinking: {
    head: { x: -4.4, y: 14.07, z: -16.13 },
    eyes: {
      left: { width: 19.05, height: 43.37, x: 0, y: 0, angle: 26.29 },
      right: { width: 19.05, height: 43.37, x: 0, y: 0, angle: -20.25 },
      spacing: 51.73,
    },
  },
};

const eyePosition = (eye, spacing, side) => ({
  transform: `translate(${160 + side * spacing / 2 + eye.x}px, ${160 + eye.y}px)`,
});

const eyeShape = (eye) => ({
  transform: `rotate(${eye.angle}deg) scale(${eye.width / 20}, ${eye.height / 50})`,
});

export default function AssistantMascot({ working = false }) {
  const [curious, setCurious] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const expression = working ? EXPRESSIONS.thinking : curious ? EXPRESSIONS.curious : EXPRESSIONS.idle;

  useEffect(() => {
    if (working || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => setCurious((value) => !value), 5200);
    return () => window.clearInterval(timer);
  }, [working]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let timer;
    let blinkTimer;
    const scheduleBlink = () => {
      timer = window.setTimeout(() => {
        setBlinking(true);
        blinkTimer = window.setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 280);
      }, 3400 + Math.random() * 2800);
    };
    scheduleBlink();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(blinkTimer);
    };
  }, []);

  const poseStyle = {
    transform: `perspective(720px) rotateX(${expression.head.x * -0.4}deg) rotateY(${expression.head.y * 0.55}deg) rotateZ(${expression.head.z * 0.12}deg)`,
  };
  const faceStyle = {
    transform: `translate(${expression.head.y * 0.42}px, ${expression.head.x * -0.34}px) rotate(${expression.head.z * 0.55}deg)`,
  };

  return (
    <span className={`assistant-mascot${working ? " assistant-mascot--working" : ""}${blinking ? " assistant-mascot--blinking" : ""}`} aria-hidden="true">
      <svg className="assistant-mascot__figure" viewBox="20 20 280 280" style={poseStyle}>
        <g className="assistant-mascot__body"><circle className="assistant-mascot__body-fill" cx="160" cy="160" r="120" /></g>
        <g className="assistant-mascot__eyes" style={faceStyle}>
          {[-1, 1].map((side) => {
            const eye = side === -1 ? expression.eyes.left : expression.eyes.right;
            return (
              <g key={side} className="assistant-mascot__eye" style={eyePosition(eye, expression.eyes.spacing, side)}>
                <g className="assistant-mascot__eye-shape" style={eyeShape(eye)}><rect x="-10" y="-25" width="20" height="50" rx="10" /></g>
              </g>
            );
          })}
        </g>
      </svg>
    </span>
  );
}
