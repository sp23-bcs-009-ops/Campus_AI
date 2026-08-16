import React, { useRef } from 'react';
import { ScrollView } from 'react-native';
import Svg, { Path, Rect, Circle, Text as SvgText, Line, G } from 'react-native-svg';
import { FLOORS, FLOOR_LABELS, FALLBACK_LECTURE_SLOTS } from '../../constants/config';
import { SS } from '../../constants/colors';
import { toMin, getFullRoomStatus } from '../../utils/helpers';

function polar(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function RoomBlock({ room, dark, timetable, now, arrangedClasses, cancelledSlots, lectureSlots, onPress }) {
  const isLT  = room.type === 'lt';
  const isLab = room.type === 'lab';

  let c, status = 'free', isMine = false, isArr = false;

  if (isLT || isLab) {
    const rs = getFullRoomStatus(room.id, now, timetable, arrangedClasses, cancelledSlots, lectureSlots);
    status = rs.status;
    c = SS[status][dark ? 'd' : 'l'];
    isMine = status === 'mine';
    isArr  = status === 'arranged';
  } else {
    c = dark
      ? { bg: '#1E1E30', bd: '#334155', tx: '#94A3B8' }
      : { bg: '#F8F9FA', bd: '#CBD5E1', tx: '#64748B' };
  }

  const x = room.cx - room.w / 2;
  const y = room.cy - room.h / 2;
  const clickable = isLT || isLab;
  const hasBar = isMine || isArr;

  return (
    <G onPress={clickable ? () => onPress(room.id) : undefined}>
      {isMine && (
        <Rect x={x-3} y={y-3} width={room.w+6} height={room.h+6} rx={9}
          fill="#EF4444" opacity={0.15} />
      )}
      <Rect x={x} y={y} width={room.w} height={room.h} rx={5}
        fill={c.bg} stroke={c.bd} strokeWidth={hasBar ? 2 : 1} />
      {hasBar && (
        <Rect x={x} y={y} width={room.w} height={3} rx={2} fill={c.bd} />
      )}
      {isLT && <>
        <SvgText x={room.cx} y={room.cy - 1} textAnchor="middle"
          fontSize={room.w > 80 ? 11 : 10} fontWeight="700" fill={c.tx}>
          {room.id}
        </SvgText>
        <Circle cx={room.cx} cy={room.cy + 10} r={3.5} fill={c.dt || c.bd} opacity={0.9} />
        {isArr && (
          <SvgText x={room.cx} y={room.cy + 20} textAnchor="middle" fontSize={6} fontWeight="700" fill={c.tx}>
            Arranged
          </SvgText>
        )}
      </>}
      {isLab && <>
        <SvgText x={room.cx} y={room.cy - 3} textAnchor="middle" fontSize={7} fontWeight="700" fill={c.tx}>
          {room.id}
        </SvgText>
        <SvgText x={room.cx} y={room.cy + 7} textAnchor="middle" fontSize={6} fill={c.tx} opacity={0.75}>
          {room.label}
        </SvgText>
      </>}
      {!isLT && !isLab && (
        <SvgText x={room.cx} y={room.cy + 4} textAnchor="middle" fontSize={6} fill={c.tx}>
          {room.label || room.id}
        </SvgText>
      )}
    </G>
  );
}

export default function ArcMap({ floor, dark, timetable, now, arrangedClasses, cancelledSlots, lectureSlots, onRoomPress }) {
  const fd = FLOORS[floor];
  if (!fd) return null;

  const { arcRooms, outerR, innerR } = fd;
  const leftWing  = fd.leftWing  || [];
  const rightWing = fd.rightWing || [];
  const ACX = 380, ACY = 460;
  const lc  = dark ? '#9B7EF8' : '#3D2B8E';

  const span = 64, sA = 270 - span / 2, eA = 270 + span / 2;
  const p = (r, deg) => polar(ACX, ACY, r, deg);
  const oS = p(outerR,sA), oE = p(outerR,eA);
  const iS = p(innerR,sA), iE = p(innerR,eA);
  const band = `M${oS.x} ${oS.y} A${outerR} ${outerR} 0 0 1 ${oE.x} ${oE.y} L${iE.x} ${iE.y} A${innerR} ${innerR} 0 0 0 ${iS.x} ${iS.y} Z`;
  const cO = innerR + 12;
  const coS = p(cO,sA), coE = p(cO,eA), ciS = p(cO,sA), ciE = p(cO,eA);
  // corridor arc
  const corrInner = innerR;
  const corrOuter = innerR + 12;
  const corrOS = p(corrOuter,sA), corrOE = p(corrOuter,eA);
  const corrIS = p(corrInner,sA), corrIE = p(corrInner,eA);
  const corr = `M${corrOS.x} ${corrOS.y} A${corrOuter} ${corrOuter} 0 0 1 ${corrOE.x} ${corrOE.y} L${corrIE.x} ${corrIE.y} A${corrInner} ${corrInner} 0 0 0 ${corrIS.x} ${corrIS.y} Z`;

  const arcBaseL = p(innerR + 2, sA);
  const arcBaseR = p(innerR + 2, eA);
  const fwL = leftWing[0], fwR = rightWing[0];

  const VB_X = 0, VB_Y = 220, VB_W = 760, VB_H = 220;
  const SVG_W = 760;

  const scrollRef = useRef(null);
  React.useEffect(() => {
    // Auto-scroll to centre arc on mount
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: (380 / 760) * SVG_W - 180, animated: false });
    }, 50);
  }, [floor]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
    >
      <Svg width={SVG_W} height={VB_H} viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}>
        <Path d={band}
          fill={dark ? '#1A1A3E' : '#EEF0FF'}
          stroke={dark ? '#3D2B8E' : '#B8B0E8'}
          strokeWidth={1.5} />
        <Path d={corr}
          fill={dark ? '#0F0F2A' : '#D5D0F0'}
          stroke={dark ? '#3D2B8E' : '#B8B0E8'}
          strokeWidth={1} />
        <SvgText x={ACX} y={ACY - innerR - 8} textAnchor="middle"
          fontSize={7} fill={lc} fontWeight="700" letterSpacing={2}>
          CORRIDOR
        </SvgText>

        {arcRooms.map(r => (
          <RoomBlock key={r.id} room={r} dark={dark}
            timetable={timetable} now={now}
            arrangedClasses={arrangedClasses}
            cancelledSlots={cancelledSlots}
            lectureSlots={lectureSlots}
            onPress={onRoomPress} />
        ))}

        {fwL && (
          <Line x1={arcBaseL.x} y1={arcBaseL.y}
            x2={fwL.cx + fwL.w / 2} y2={arcBaseL.y}
            stroke={dark ? '#2A1C6B' : '#CBD5E1'} strokeWidth={1} />
        )}
        {fwR && (
          <Line x1={arcBaseR.x} y1={arcBaseR.y}
            x2={fwR.cx - fwR.w / 2} y2={arcBaseR.y}
            stroke={dark ? '#2A1C6B' : '#CBD5E1'} strokeWidth={1} />
        )}

        {leftWing.map(r => (
          <RoomBlock key={r.id} room={r} dark={dark}
            timetable={timetable} now={now}
            arrangedClasses={arrangedClasses}
            cancelledSlots={cancelledSlots}
            lectureSlots={lectureSlots}
            onPress={onRoomPress} />
        ))}
        {rightWing.map(r => (
          <RoomBlock key={r.id} room={r} dark={dark}
            timetable={timetable} now={now}
            arrangedClasses={arrangedClasses}
            cancelledSlots={cancelledSlots}
            lectureSlots={lectureSlots}
            onPress={onRoomPress} />
        ))}

        <SvgText x={ACX} y={VB_Y + 14} textAnchor="middle"
          fontSize={9} fill={lc} fontWeight="700" letterSpacing={1.5}>
          {FLOOR_LABELS[floor] || `Floor ${floor}`}
        </SvgText>
      </Svg>
    </ScrollView>
  );
}
