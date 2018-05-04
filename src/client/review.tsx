import './global.css';

import { List } from 'immutable';
import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { defaultTileRack, defaultTileRackTypes } from '../common/defaults';
import { GameMode, PlayerArrangementMode } from '../common/enums';
import { Game, MoveData } from '../common/game';
import { ActionGameOver } from '../common/gameActions/gameOver';
import { runGameTestFile } from '../common/runGameTestFile';
import { GameBoard } from './components/GameBoard';
import { GameHistory } from './components/GameHistory';
import { GameState } from './components/GameState';
import { ScoreBoard } from './components/ScoreBoard';
import { TileRackReadOnly } from './components/TileRackReadOnly';
import { GameBoardLabelMode } from './enums';
import * as style from './review.css';

const dummyMoveData = new MoveData(new Game(GameMode.Singles1, PlayerArrangementMode.RandomOrder, [], List(), List(), 0, null));

function render() {
    const moveData = game.moveDataHistory.get(selectedMove, dummyMoveData);

    let turnPlayerID = moveData.turnPlayerID;
    let movePlayerID = moveData.nextGameAction.playerID;
    if (moveData.nextGameAction instanceof ActionGameOver) {
        turnPlayerID = -1;
        movePlayerID = -1;
    }

    let tileRack: List<number | null> | undefined;
    if (followedPlayerID !== null) {
        tileRack = moveData.tileRacks.get(followedPlayerID, defaultTileRack);
    } else if (movePlayerID !== -1) {
        tileRack = moveData.tileRacks.get(movePlayerID, defaultTileRack);
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const gameBoardLeft = -2;
    const gameBoardTop = -2;
    const gameBoardCellSizeBasedOnWindowWidth = windowWidth / 2 / 12;
    const gameBoardCellSizeBasedOnWindowHeight = (windowHeight - 129) / 9;
    const gameBoardCellSize = Math.floor(Math.min(gameBoardCellSizeBasedOnWindowWidth, gameBoardCellSizeBasedOnWindowHeight));
    const gameBoardWidth = gameBoardCellSize * 12 + 2;

    const scoreBoardLeft = gameBoardLeft + gameBoardWidth;
    const scoreBoardTop = -2;
    const scoreBoardCellWidth = Math.floor(gameBoardWidth / 18);
    const scoreBoardCellHeight = Math.ceil(scoreBoardCellWidth * 0.8);
    const scoreBoardHeight = scoreBoardCellHeight * (4 + game.usernames.size) + 2;

    const tileRackLeft = scoreBoardLeft + 2;
    const tileRackTop = scoreBoardTop + scoreBoardHeight + 2;
    const tileRackHeight = gameBoardCellSize + (game.userIDs.size - 1) * (gameBoardCellSize + 4);

    const gameStateHeight = 22;
    const gameStateTop = windowHeight - gameStateHeight;

    const gameHistoryTop = tileRackTop + tileRackHeight + 4;
    const gameHistoryWidth = windowWidth - tileRackLeft;
    const gameHistoryHeight = windowHeight - gameHistoryTop - gameStateHeight - 2;

    ReactDOM.render(
        <>
            <div style={{ position: 'absolute', left: gameBoardLeft, top: gameBoardTop }}>
                <GameBoard gameBoard={moveData.gameBoard} tileRack={tileRack} labelMode={GameBoardLabelMode.Nothing} cellSize={gameBoardCellSize} />
            </div>
            <div style={{ position: 'absolute', left: scoreBoardLeft, top: scoreBoardTop }}>
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
            </div>
            {game.userIDs.map((_, playerID) => {
                const tileRack = moveData.tileRacks.get(playerID, defaultTileRack);
                const tileRackTypes = moveData.tileRackTypes.get(playerID, defaultTileRackTypes);
                return (
                    <div key={playerID} style={{ position: 'absolute', left: tileRackLeft, top: tileRackTop + playerID * (gameBoardCellSize + 4) }}>
                        <div className={style.tileRackWrapper}>
                            <TileRackReadOnly tiles={tileRack} types={tileRackTypes} buttonSize={gameBoardCellSize} />
                        </div>
                        <div className={style.buttonWrapper} style={{ height: gameBoardCellSize }}>
                            {playerID === followedPlayerID ? (
                                <input type={'button'} value={'Unlock'} onClick={unfollowPlayer} />
                            ) : (
                                <input type={'button'} value={'Lock'} onClick={followPlayer.bind(null, playerID)} />
                            )}
                        </div>
                    </div>
                );
            })}
            <div style={{ position: 'absolute', left: tileRackLeft, top: gameHistoryTop }}>
                <GameHistory
                    usernames={game.usernames}
                    moveDataHistory={game.moveDataHistory}
                    selectedMove={selectedMove}
                    width={gameHistoryWidth}
                    height={gameHistoryHeight}
                    onMoveClicked={onMoveClicked}
                />
            </div>
            <div style={{ position: 'absolute', left: tileRackLeft, top: gameStateTop }}>
                <GameState usernames={game.usernames} nextGameAction={moveData.nextGameAction} width={gameHistoryWidth} height={gameStateHeight} />
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
    const { game: g } = runGameTestFile(require('raw-loader!../common/gameTestFiles/other/no tiles played for entire round').split('\n'));
    if (g === null) {
        ReactDOM.render(<div>Couldn't load game.</div>, document.getElementById('root'));

        return;
    }

    game = g;
    selectedMove = game.moveDataHistory.size - 1;
    periodicResizeCheck();
}

main();
