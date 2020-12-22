import { List } from 'immutable';
import React from 'react';
import { PB_GameBoardType } from '../../common/pb';
import * as commonStyle from '../common.scss';
import { gameBoardTypeToCSSClassName, getTileString } from '../helpers';
import * as style from './TileRackReadOnly.scss';

export interface TileRackReadOnlyProps {
  tiles: List<number | null>;
  types: List<PB_GameBoardType | null>;
  buttonSize: number;
}

export const TileRackReadOnly = React.memo(function TileRackReadOnly({ tiles, types, buttonSize }: TileRackReadOnlyProps) {
  const buttonStyle = {
    width: buttonSize,
    minWidth: buttonSize,
    height: buttonSize,
    minHeight: buttonSize,
  };

  return (
    <div className={style.root} style={{ fontSize: Math.floor(buttonSize * 0.4) }}>
      {tiles.map((tile, i) => {
        const type = types.get(i, null);

        if (tile !== null && type !== null) {
          return (
            <div key={i} className={`${style.button} ${gameBoardTypeToCSSClassName.get(type)}`} style={buttonStyle}>
              <div>{getTileString(tile)}</div>
            </div>
          );
        } else {
          return (
            <div key={i} className={`${style.button} ${commonStyle.invisible}`} style={buttonStyle}>
              ?
            </div>
          );
        }
      })}
    </div>
  );
});
