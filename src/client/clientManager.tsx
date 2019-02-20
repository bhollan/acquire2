import { List } from 'immutable';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as SockJS from 'sockjs-client';
import { defaultGameBoard } from '../common/defaults';
import { ErrorCode, GameMode, GameSetupChange, MessageToClient, MessageToServer, PlayerArrangementMode } from '../common/enums';
import { Game } from '../common/game';
import { ActionGameOver } from '../common/gameActions/gameOver';
import { GameSetup } from '../common/gameSetup';
import * as style from './clientManager.scss';
import { CreateGame } from './components/CreateGame';
import { GameBoard } from './components/GameBoard';
import { GameHistory } from './components/GameHistory';
import { GameListing } from './components/GameListing';
import { GameSetupUI } from './components/GameSetupUI';
import { GameState } from './components/GameState';
import { Header } from './components/Header';
import { LoginForm } from './components/LoginForm';
import { ScoreBoard } from './components/ScoreBoard';
import { TileRack } from './components/TileRack';
import { GameBoardLabelMode, GameStatus } from './enums';

export enum ClientManagerPage {
  Login,
  Connecting,
  Lobby,
  Game,
}

export class ClientManager {
  errorCode: ErrorCode | null = null;
  page = ClientManagerPage.Login;

  socket: WebSocket | null = null;

  myClient: Client | null = null;
  clientIDToClient = new Map<number, Client>();
  userIDToUser = new Map<number, User>();
  gameIDToGameData = new Map<number, GameData>();
  gameDisplayNumberToGameData = new Map<number, GameData>();

  username = '';
  password = '';

  renderPageFunctions: Map<ClientManagerPage, () => JSX.Element>;
  onMessageFunctions: Map<MessageToClient, (...params: any[]) => void>;

  constructor() {
    this.renderPageFunctions = new Map([
      [ClientManagerPage.Login, this.renderLoginPage],
      [ClientManagerPage.Connecting, this.renderConnectingPage],
      [ClientManagerPage.Lobby, this.renderLobbyPage],
      [ClientManagerPage.Game, this.renderGamePage],
    ]);

    const mf: [number, (...params: any[]) => void][] = [
      [MessageToClient.FatalError, this.onMessageFatalError],
      [MessageToClient.Greetings, this.onMessageGreetings],
      [MessageToClient.ClientConnected, this.onMessageClientConnected],
      [MessageToClient.ClientDisconnected, this.onMessageClientDisconnected],
      [MessageToClient.GameCreated, this.onMessageGameCreated],
      [MessageToClient.ClientEnteredGame, this.onMessageClientEnteredGame],
      [MessageToClient.ClientExitedGame, this.onMessageClientExitedGame],
      [MessageToClient.GameSetupChanged, this.onMessageGameSetupChanged],
      [MessageToClient.GameStarted, this.onMessageGameStarted],
      [MessageToClient.GameActionDone, this.onMessageGameActionDone],
    ];
    this.onMessageFunctions = new Map(mf);
  }

  manage() {
    this.render();

    let resizeTimeout = 0;
    window.addEventListener(
      'resize',
      () => {
        if (!resizeTimeout) {
          // @ts-ignore
          resizeTimeout = setTimeout(() => {
            resizeTimeout = 0;
            this.render();
          }, 66);
        }
      },
      false,
    );
  }

  render() {
    ReactDOM.render(this.renderPageFunctions.get(this.page)!(), document.getElementById('root'));
  }

  renderLoginPage = () => {
    return (
      <>
        <h1>Acquire</h1>
        <h2>Login</h2>
        <LoginForm errorCode={this.errorCode !== null ? this.errorCode : undefined} username={this.username} onSubmit={this.onSubmitLoginForm} />
      </>
    );
  };

  onSubmitLoginForm = (username: string, password: string) => {
    this.errorCode = null;
    this.setPage(ClientManagerPage.Connecting);

    this.username = username;
    this.password = password;

    this.connect();

    this.render();
  };

  renderConnectingPage = () => {
    return (
      <>
        <h1>Acquire</h1>
        <p>Connecting...</p>
      </>
    );
  };

  renderHeader = () => {
    return <Header username={this.username} isConnected={this.isConnected()} />;
  };

  renderLobbyPage = () => {
    return (
      <>
        {this.renderHeader()}
        <CreateGame onSubmit={this.onSubmitCreateGame} />
        {[...this.gameIDToGameData].reverse().map(([gameID, gameData]) => {
          if (gameData.gameSetup !== null) {
            return (
              <GameListing
                key={gameID}
                gameBoard={defaultGameBoard}
                usernames={gameData.gameSetup.usernames}
                gameDisplayNumber={gameData.displayNumber}
                gameMode={gameData.gameSetup.gameMode}
                gameStatus={GameStatus.SettingUp}
                onEnterClicked={gameData.onEnterClicked}
              />
            );
          }
        })}
      </>
    );
  };

  onSubmitCreateGame = (gameMode: GameMode) => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.CreateGame, gameMode]));
    }
  };

  renderGamePage = () => {
    const gameData = this.myClient!.gameData!;

    if (gameData.game !== null) {
      return this.renderGamePageGame();
    } else {
      return this.renderGamePageGameSetup();
    }
  };

  onExitGameClicked = () => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.ExitGame]));
    }
  };

  renderGamePageGameSetup() {
    const gameSetup = this.myClient!.gameData!.gameSetup!;
    const myUserID = this.myClient!.user.id;
    const isHost = myUserID === gameSetup.hostUserID;
    const isJoined = gameSetup.userIDsSet.has(myUserID);

    return (
      <>
        {this.renderHeader()}

        <div>
          <input type={'button'} value={'Exit Game'} onClick={this.onExitGameClicked} />
        </div>

        {!isHost && (
          <div>
            {isJoined ? (
              <input type={'button'} value={'Stand Up'} onClick={this.onUnjoinGame} />
            ) : (
              <input type={'button'} value={'Sit Down'} onClick={this.onJoinGame} />
            )}
          </div>
        )}

        <GameSetupUI
          gameMode={gameSetup.gameMode}
          playerArrangementMode={gameSetup.playerArrangementMode}
          usernames={gameSetup.usernames}
          userIDs={gameSetup.userIDs}
          approvals={gameSetup.approvals}
          hostUserID={gameSetup.hostUserID}
          myUserID={this.myClient!.user.id}
          onChangeGameMode={isHost ? this.onChangeGameMode : undefined}
          onChangePlayerArrangementMode={isHost ? this.onChangePlayerArrangementMode : undefined}
          onSwapPositions={isHost ? this.onSwapPositions : undefined}
          onKickUser={isHost ? this.onKickUser : undefined}
          onApprove={this.onApproveOfGameSetup}
        />
      </>
    );
  }

  onTileClicked = (_tile: number) => {
    // do nothing
  };

  onMoveClicked = (_index: number) => {
    // do nothing
  };

  renderGamePageGame() {
    const game = this.myClient!.gameData!.game!;
    const selectedMove = game.moveDataHistory.size - 1;

    const playerID = game.userIDs.indexOf(game.myUserID || -1);

    const moveData = game.moveDataHistory.get(selectedMove)!;

    let turnPlayerID = moveData.turnPlayerID;
    let movePlayerID = moveData.nextGameAction.playerID;
    if (moveData.nextGameAction instanceof ActionGameOver) {
      turnPlayerID = -1;
      movePlayerID = -1;
    }

    const tileRack = moveData.tileRacks.get(playerID);
    const tileRackTypes = moveData.tileRackTypes.get(playerID);

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const gameBoardCellSizeBasedOnWindowWidth = windowWidth / 2 / 12;
    const gameBoardCellSizeBasedOnWindowHeight = (windowHeight - 129) / 9;
    const gameBoardCellSize = Math.floor(Math.min(gameBoardCellSizeBasedOnWindowWidth, gameBoardCellSizeBasedOnWindowHeight));
    const gameBoardWidth = gameBoardCellSize * 12 + 2;

    const scoreBoardCellWidth = Math.floor(Math.min(windowWidth - gameBoardWidth, gameBoardWidth) / 18);

    return (
      <div className={style.root}>
        {this.renderHeader()}

        <div className={style.main}>
          <div className={style.leftSide}>
            <GameBoard
              gameBoard={moveData.gameBoard}
              tileRack={moveData.tileRacks.get(playerID)}
              labelMode={GameBoardLabelMode.Nothing}
              cellSize={gameBoardCellSize}
            />
          </div>
          <div className={style.rightSide}>
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
            {tileRack !== undefined && tileRackTypes !== undefined ? (
              <TileRack
                tiles={tileRack}
                types={tileRackTypes}
                buttonSize={gameBoardCellSize}
                keyboardShortcutsEnabled={false}
                onTileClicked={this.onTileClicked}
              />
            ) : (
              undefined
            )}
            <GameHistory usernames={game.usernames} moveDataHistory={game.moveDataHistory} onMoveClicked={this.onMoveClicked} />
            <GameState usernames={game.usernames} nextGameAction={moveData.nextGameAction} />
          </div>
        </div>
      </div>
    );
  }

  onJoinGame = () => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.JoinGame]));
    }
  };

  onUnjoinGame = () => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.UnjoinGame]));
    }
  };

  onApproveOfGameSetup = () => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.ApproveOfGameSetup]));
    }
  };

  onChangeGameMode = (gameMode: GameMode) => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.ChangeGameMode, gameMode]));
    }
  };

  onChangePlayerArrangementMode = (playerArrangementMode: PlayerArrangementMode) => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.ChangePlayerArrangementMode, playerArrangementMode]));
    }
  };

  onSwapPositions = (position1: number, position2: number) => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.SwapPositions, position1, position2]));
    }
  };

  onKickUser = (userID: number) => {
    if (this.isConnected()) {
      this.socket!.send(JSON.stringify([MessageToServer.KickUser, userID]));
    }
  };

  connect = () => {
    this.socket = new SockJS('http://localhost:9999/sockjs');

    this.socket.onopen = this.onSocketOpen;
    this.socket.onmessage = this.onSocketMessage;
    this.socket.onclose = this.onSocketClose;
  };

  onSocketOpen = () => {
    this.socket!.send(JSON.stringify([0, this.username, this.password, []]));
  };

  onSocketMessage = (e: MessageEvent) => {
    const messages = JSON.parse(e.data);

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const handler = this.onMessageFunctions.get(message[0])!;
      handler.apply(this, message.slice(1));
    }

    this.render();
  };

  onMessageFatalError(errorCode: ErrorCode) {
    this.errorCode = errorCode;
  }

  onMessageGreetings(myClientID: number, users: any[], games: any[]) {
    this.clientIDToClient.clear();
    this.userIDToUser.clear();
    this.gameIDToGameData.clear();
    this.gameDisplayNumberToGameData.clear();

    for (let i = 0; i < games.length; i++) {
      const gameParams = games[i];
      const gameID: number = gameParams[1];
      const gameDisplayNumber: number = gameParams[2];

      const gameData = new GameData(gameID, gameDisplayNumber, this);

      this.gameIDToGameData.set(gameID, gameData);
      this.gameDisplayNumberToGameData.set(gameDisplayNumber, gameData);
    }

    for (let i = 0; i < users.length; i++) {
      const [userID, username, clientDatas] = users[i];

      const user = new User(userID, username);
      this.userIDToUser.set(userID, user);

      if (clientDatas !== undefined) {
        for (let j = 0; j < clientDatas.length; j++) {
          const clientData = clientDatas[j];
          const clientID: number = clientData[0];
          const gameDisplayNumber: number | undefined = clientData[1];

          const client = new Client(clientID, user);
          user.clients.add(client);
          if (gameDisplayNumber !== undefined) {
            const gameData = this.gameDisplayNumberToGameData.get(gameDisplayNumber)!;
            client.gameData = gameData;
            gameData.clients.add(client);
          }
          this.clientIDToClient.set(clientID, client);
        }
      }
    }

    for (let i = 0; i < games.length; i++) {
      const gameParams = games[i];
      const isGameSetup = gameParams[0] === 0;
      const gameID: number = gameParams[1];

      const gameData = this.gameIDToGameData.get(gameID)!;

      if (isGameSetup) {
        const gameSetupJSON = gameParams.slice(3);

        gameData.gameSetup = GameSetup.fromJSON(gameSetupJSON, this.getUsernameForUserID);

        const userIDs: number[] = gameSetupJSON[3];
        for (let j = 0; j < userIDs.length; j++) {
          const userID = userIDs[j];
          if (userID !== 0) {
            this.userIDToUser.get(userID)!.numGames++;
          }
        }
      }
    }

    this.myClient = this.clientIDToClient.get(myClientID)!;

    this.setPage(this.myClient.gameData !== null ? ClientManagerPage.Game : ClientManagerPage.Lobby);
  }

  onMessageClientConnected(clientID: number, userID: number, username?: string) {
    let user: User;
    if (username !== undefined) {
      user = new User(userID, username);
      this.userIDToUser.set(userID, user);
    } else {
      user = this.userIDToUser.get(userID)!;
    }

    const client = new Client(clientID, user);
    user.clients.add(client);
    this.clientIDToClient.set(clientID, client);
  }

  onMessageClientDisconnected(clientID: number) {
    const client = this.clientIDToClient.get(clientID)!;
    const user = client.user;

    this.clientIDToClient.delete(clientID);
    user.clients.delete(client);
    this.deleteUserIfItDoesNotHaveReferences(user);
  }

  onMessageGameCreated(gameID: number, gameDisplayNumber: number, gameMode: GameMode, hostClientID: number) {
    const hostClient = this.clientIDToClient.get(hostClientID)!;

    const gameData = new GameData(gameID, gameDisplayNumber, this);
    gameData.gameSetup = new GameSetup(gameMode, PlayerArrangementMode.RandomOrder, hostClient.user.id, this.getUsernameForUserID);

    hostClient.user.numGames++;

    this.gameIDToGameData.set(gameID, gameData);
    this.gameDisplayNumberToGameData.set(gameDisplayNumber, gameData);
  }

  onMessageClientEnteredGame(clientID: number, gameDisplayNumber: number) {
    const client = this.clientIDToClient.get(clientID)!;
    const gameData = this.gameDisplayNumberToGameData.get(gameDisplayNumber)!;

    client.gameData = gameData;
    gameData.clients.add(client);

    if (client === this.myClient) {
      this.setPage(ClientManagerPage.Game);
    }
  }

  onMessageClientExitedGame(clientID: number) {
    const client = this.clientIDToClient.get(clientID)!;
    const gameData = client.gameData!;

    client.gameData = null;
    gameData.clients.delete(client);

    if (client === this.myClient) {
      this.setPage(ClientManagerPage.Lobby);
    }
  }

  onMessageGameSetupChanged(gameDisplayNumber: number, ...params: any[]) {
    const gameSetup = this.gameDisplayNumberToGameData.get(gameDisplayNumber)!.gameSetup!;

    gameSetup.processChange(params);

    switch (params[0]) {
      case GameSetupChange.UserAdded:
        this.userIDToUser.get(params[1])!.numGames++;
        break;
      case GameSetupChange.UserRemoved:
      case GameSetupChange.UserKicked:
        const user = this.userIDToUser.get(params[1])!;
        user.numGames--;
        this.deleteUserIfItDoesNotHaveReferences(user);
        break;
    }
  }

  onMessageGameStarted(gameDisplayNumber: number, userIDs: number[]) {
    const gameData = this.gameDisplayNumberToGameData.get(gameDisplayNumber)!;
    const gameSetup = gameData.gameSetup!;

    const game = new Game(
      gameSetup.gameMode,
      gameSetup.playerArrangementMode,
      [],
      List(userIDs),
      List(userIDs.map(this.getUsernameForUserID)),
      gameSetup.hostUserID,
      this.myClient!.user.id,
    );

    gameData.gameSetup = null;
    gameData.game = game;
  }

  onMessageGameActionDone(gameDisplayNumber: number, ...moveDataMessage: any[]) {
    const game = this.gameDisplayNumberToGameData.get(gameDisplayNumber)!.game!;

    game.processMoveDataMessage(moveDataMessage);
  }

  onSocketClose = () => {
    this.socket = null;

    if (this.errorCode !== null) {
      this.setPage(ClientManagerPage.Login);
    } else if (this.page === ClientManagerPage.Connecting) {
      this.errorCode = ErrorCode.CouldNotConnect;
      this.setPage(ClientManagerPage.Login);
    }

    this.render();
  };

  setPage(page: ClientManagerPage) {
    this.page = page;
  }

  isConnected() {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  getUsernameForUserID = (userID: number) => {
    return this.userIDToUser.get(userID)!.name;
  };

  deleteUserIfItDoesNotHaveReferences(user: User) {
    if (user.clients.size === 0 && user.numGames === 0) {
      this.userIDToUser.delete(user.id);
    }
  }
}

export class Client {
  gameData: GameData | null = null;

  constructor(public id: number, public user: User) {}
}

export class User {
  clients = new Set<Client>();

  numGames = 0;

  constructor(public id: number, public name: string) {}
}

export class GameData {
  gameSetup: GameSetup | null = null;
  game: Game | null = null;

  clients = new Set<Client>();

  constructor(public id: number, public displayNumber: number, public clientManager: ClientManager) {}

  onEnterClicked = () => {
    if (this.clientManager.isConnected()) {
      this.clientManager.socket!.send(JSON.stringify([MessageToServer.EnterGame, this.displayNumber]));
    }
  };
}
