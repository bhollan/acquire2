import './global.css';

import { List } from 'immutable';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { defaultTileRack, defaultTileRackTypes } from '../common/defaults';
import { Game } from '../common/game';
import { ActionGameOver } from '../common/gameActions/gameOver';
import { dummyMoveData } from '../common/helpers';
import { GameBoard } from './components/GameBoard';
import { GameHistory } from './components/GameHistory';
import { GameState } from './components/GameState';
import { ScoreBoard } from './components/ScoreBoard';
import { TileRackReadOnly } from './components/TileRackReadOnly';
import { GameBoardLabelMode } from './enums';
import * as style from './review.css';

function render() {
    const moveData = game.moveDataHistory.get(selectedMove, dummyMoveData);

    let turnPlayerID = moveData.turnPlayerID;
    let movePlayerID = moveData.nextGameAction.playerID;
    if (moveData.nextGameAction instanceof ActionGameOver) {
        turnPlayerID = -1;
        movePlayerID = -1;
    }

    let tileRack: List<number | null> | undefined;
    if (game.userIDs.size > 1) {
        if (followedPlayerID !== null) {
            tileRack = moveData.tileRacks.get(followedPlayerID, defaultTileRack);
        } else if (movePlayerID !== -1) {
            tileRack = moveData.tileRacks.get(movePlayerID, defaultTileRack);
        }
    } else {
        tileRack = moveData.tileRacks.get(0, defaultTileRack);
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const gameBoardLeft = -2;
    const gameBoardTop = -2;
    const gameBoardCellSizeBasedOnWindowWidth = windowWidth / 2 / 12;
    const gameBoardCellSizeBasedOnWindowHeight = (windowHeight - 129) / 9;
    const gameBoardCellSize = Math.floor(Math.min(gameBoardCellSizeBasedOnWindowWidth, gameBoardCellSizeBasedOnWindowHeight));
    const gameBoardWidth = gameBoardCellSize * 12 + 2;

    const rightSideLeft = gameBoardLeft + gameBoardWidth;
    const rightSideTop = -2;
    const rightSideWidth = windowWidth - (gameBoardLeft + gameBoardWidth);
    const rightSideHeight = windowHeight + 2;

    const scoreBoardCellWidth = Math.floor(gameBoardWidth / 18);

    ReactDOM.render(
        <>
            <div style={{ position: 'absolute', left: gameBoardLeft, top: gameBoardTop }}>
                <GameBoard gameBoard={moveData.gameBoard} tileRack={tileRack} labelMode={GameBoardLabelMode.Nothing} cellSize={gameBoardCellSize} />
            </div>
            <div
                className={style.rightSide}
                style={{ position: 'absolute', left: rightSideLeft, top: rightSideTop, width: rightSideWidth, height: rightSideHeight }}
            >
                <ScoreBoard
                    usernames={game.usernames}
                    scoreBoard={moveData.scoreBoard}
                    scoreBoardAvailable={moveData.scoreBoardAvailable}
                    scoreBoardChainSize={moveData.scoreBoardChainSize}
                    scoreBoardPrice={moveData.scoreBoardPrice}
                    safeChains={moveData.safeChains}
                    turnPlayerID={turnPlayerID}
                    movePlayerID={movePlayerID}
                    gameMode={game.gameMode}
                    cellWidth={scoreBoardCellWidth}
                />
                {game.userIDs.map((_, playerID) => {
                    const tileRack = moveData.tileRacks.get(playerID, defaultTileRack);
                    const tileRackTypes = moveData.tileRackTypes.get(playerID, defaultTileRackTypes);
                    return (
                        <div key={playerID}>
                            <div className={style.tileRackWrapper}>
                                <TileRackReadOnly tiles={tileRack} types={tileRackTypes} buttonSize={gameBoardCellSize} />
                            </div>
                            {game.userIDs.size > 1 ? (
                                <div className={style.buttonWrapper} style={{ height: gameBoardCellSize }}>
                                    {playerID === followedPlayerID ? (
                                        <input type={'button'} value={'Unlock'} onClick={unfollowPlayer} />
                                    ) : (
                                        <input type={'button'} value={'Lock'} onClick={followPlayer.bind(null, playerID)} />
                                    )}
                                </div>
                            ) : (
                                undefined
                            )}
                        </div>
                    );
                })}
                <GameHistory usernames={game.usernames} moveDataHistory={game.moveDataHistory} selectedMove={selectedMove} onMoveClicked={onMoveClicked} />
                <GameState usernames={game.usernames} nextGameAction={moveData.nextGameAction} />
            </div>
        </>,
        document.getElementById('root'),
    );
}

function onMoveClicked(index: number) {
    if (index !== selectedMove) {
        selectedMove = index;
        render();
    }
}

function followPlayer(playerID: number) {
    followedPlayerID = playerID;
    render();
}

function unfollowPlayer() {
    followedPlayerID = null;
    render();
}

window.addEventListener('keydown', event => {
    const keyName = event.key;

    if (keyName === 'ArrowLeft' || keyName === 'ArrowRight') {
        const previouslySelectedMove = selectedMove;

        if (keyName === 'ArrowLeft') {
            selectedMove--;
            if (selectedMove < 0) {
                selectedMove = 0;
            }
        } else {
            selectedMove++;
            const lastMove = game.moveDataHistory.size - 1;
            if (selectedMove > lastMove) {
                selectedMove = lastMove;
            }
        }

        if (selectedMove !== previouslySelectedMove) {
            render();
        }
    }
});

let lastPeriodicResizeCheckWidth = -1;
let lastPeriodicResizeCheckHeight = -1;
function periodicResizeCheck() {
    if (window.innerWidth !== lastPeriodicResizeCheckWidth || window.innerHeight !== lastPeriodicResizeCheckHeight) {
        lastPeriodicResizeCheckWidth = window.innerWidth;
        lastPeriodicResizeCheckHeight = window.innerHeight;
        render();
    }

    setTimeout(periodicResizeCheck, 500);
}

let game: Game;
let selectedMove: number;
let followedPlayerID: number | null = null;

function main() {
    const gameJson = require('raw-loader!../common/gameTestFiles/other/no tiles played for entire round').split('\nGame JSON:\n')[1];
    const g = Game.fromJSON(JSON.parse(gameJson));

    if (g === null) {
        ReactDOM.render(<div>Couldn't load game.</div>, document.getElementById('root'));

        return;
    }

    game = g;
    selectedMove = game.moveDataHistory.size - 1;
    periodicResizeCheck();
}

main();
