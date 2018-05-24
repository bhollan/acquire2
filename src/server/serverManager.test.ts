import { Connection } from 'sockjs';
import { ErrorCode, MessageToClient } from '../common/enums';
import { Client, ConnectionState, ServerManager, User } from './serverManager';
import { TestUserDataProvider } from './userDataProvider';

describe('ServerManager', () => {
    describe('when not sending first message', () => {
        it('can open connections and then close them', () => {
            const { serverManager, server } = getServerManagerAndStuff();

            const connection1 = new TestConnection('connection ID 1');
            server.openConnection(connection1);

            expect(serverManager.connectionIDToConnectionState).toEqual(new Map([[connection1.id, ConnectionState.WaitingForFirstMessage]]));
            expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map([[connection1.id, connection1]]));

            const connection2 = new TestConnection('connection ID 2');
            server.openConnection(connection2);

            expect(serverManager.connectionIDToConnectionState).toEqual(
                new Map([[connection1.id, ConnectionState.WaitingForFirstMessage], [connection2.id, ConnectionState.WaitingForFirstMessage]]),
            );
            expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map([[connection1.id, connection1], [connection2.id, connection2]]));

            connection1.close();

            expect(serverManager.connectionIDToConnectionState).toEqual(new Map([[connection2.id, ConnectionState.WaitingForFirstMessage]]));
            expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map([[connection2.id, connection2]]));

            connection2.close();

            expect(serverManager.connectionIDToConnectionState).toEqual(new Map());
            expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map());
        });

        it('closing already closed connection does nothing', () => {
            const { serverManager, server } = getServerManagerAndStuff();

            const connection1 = new TestConnection('connection ID 1');
            server.openConnection(connection1);

            expect(serverManager.connectionIDToConnectionState).toEqual(new Map([[connection1.id, ConnectionState.WaitingForFirstMessage]]));
            expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map([[connection1.id, connection1]]));

            const connection2 = new TestConnection('connection ID 2');
            server.openConnection(connection2);

            expect(serverManager.connectionIDToConnectionState).toEqual(
                new Map([[connection1.id, ConnectionState.WaitingForFirstMessage], [connection2.id, ConnectionState.WaitingForFirstMessage]]),
            );
            expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map([[connection1.id, connection1], [connection2.id, connection2]]));

            connection1.close();

            expect(serverManager.connectionIDToConnectionState).toEqual(new Map([[connection2.id, ConnectionState.WaitingForFirstMessage]]));
            expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map([[connection2.id, connection2]]));

            connection1.close();

            expect(serverManager.connectionIDToConnectionState).toEqual(new Map([[connection2.id, ConnectionState.WaitingForFirstMessage]]));
            expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map([[connection2.id, connection2]]));
        });
    });

    describe('when sending first message', () => {
        describe('gets kicked', () => {
            async function getsKickedWithMessage(inputMessage: any, outputErrorCode: ErrorCode) {
                const { server, userDataProvider } = getServerManagerAndStuff();

                await userDataProvider.createUser('has password', 'password');
                await userDataProvider.createUser('does not have password', null);

                const connection = new TestConnection('connection');
                server.openConnection(connection);
                connection.sendMessage(inputMessage);

                await new Promise(resolve => setTimeout(resolve, 0));

                expect(connection.receivedMessages).toEqual([[[MessageToClient.FatalError, outputErrorCode]]]);
                expect(connection.closed).toBe(true);
            }

            it('after sending invalid JSON', async () => {
                await getsKickedWithMessage('', ErrorCode.InvalidMessageFormat);
                await getsKickedWithMessage('not json', ErrorCode.InvalidMessageFormat);
            });

            it('after sending a non-array', async () => {
                await getsKickedWithMessage({}, ErrorCode.InvalidMessageFormat);
                await getsKickedWithMessage(null, ErrorCode.InvalidMessageFormat);
            });

            it('after sending an array with the wrong length', async () => {
                await getsKickedWithMessage([1, 2, 3], ErrorCode.InvalidMessageFormat);
                await getsKickedWithMessage([1, 2, 3, 4, 5], ErrorCode.InvalidMessageFormat);
            });

            it('after sending wrong version', async () => {
                await getsKickedWithMessage([-1, 'username', 'password', []], ErrorCode.NotUsingLatestVersion);
                await getsKickedWithMessage([{}, 'username', 'password', []], ErrorCode.NotUsingLatestVersion);
            });

            it('after sending invalid username', async () => {
                await getsKickedWithMessage([0, '', 'password', []], ErrorCode.InvalidUsername);
                await getsKickedWithMessage([0, '123456789012345678901234567890123', 'password', []], ErrorCode.InvalidUsername);
                await getsKickedWithMessage([0, '▲', 'password', []], ErrorCode.InvalidUsername);
            });

            it('after sending invalid password', async () => {
                await getsKickedWithMessage([0, 'username', 0, []], ErrorCode.InvalidMessageFormat);
                await getsKickedWithMessage([0, 'username', {}, []], ErrorCode.InvalidMessageFormat);
            });

            it('after sending invalid game data array', async () => {
                await getsKickedWithMessage([0, 'username', '', 0], ErrorCode.InvalidMessageFormat);
                await getsKickedWithMessage([0, 'username', '', {}], ErrorCode.InvalidMessageFormat);
            });

            it('after not providing password', async () => {
                await getsKickedWithMessage([0, 'has password', '', []], ErrorCode.MissingPassword);
            });

            it('after providing incorrect password', async () => {
                await getsKickedWithMessage([0, 'has password', 'not my password', []], ErrorCode.IncorrectPassword);
            });

            it('after providing a password when it is not set', async () => {
                await getsKickedWithMessage([0, 'does not have password', 'password', []], ErrorCode.ProvidedPassword);
            });

            it('after providing a password when user data does not exist', async () => {
                await getsKickedWithMessage([0, 'no user data', 'password', []], ErrorCode.ProvidedPassword);
            });

            it("after an error from user data provider's lookupUser()", async () => {
                await getsKickedWithMessage([0, 'lookupUser error', 'password', []], ErrorCode.InternalServerError);
            });

            it("after an error from user data provider's createUser()", async () => {
                await getsKickedWithMessage([0, 'createUser error', '', []], ErrorCode.InternalServerError);
            });
        });

        describe('gets logged in', () => {
            async function getsLoggedIn(username: string, password: string, expectedUserID: number) {
                const { serverManager, server, userDataProvider } = getServerManagerAndStuff();

                await userDataProvider.createUser('has password', 'password');
                await userDataProvider.createUser('does not have password', null);

                const connection1 = new TestConnection('connection 1');
                server.openConnection(connection1);
                connection1.sendMessage([0, username, password, []]);
                await new Promise(resolve => setTimeout(resolve, 0));

                function expectJustConnection1Data() {
                    expect(serverManager.connectionIDToConnectionState).toEqual(new Map([[connection1.id, ConnectionState.LoggedIn]]));
                    expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map());
                    expect(serverManager.clientIDManager.used).toEqual(new Set([1]));
                    expectClientAndUser(serverManager, [[expectedUserID, username, [[1, connection1]]]]);
                    expect(connection1.closed).toBe(false);
                }
                expectJustConnection1Data();
                expect(connection1.receivedMessages.length).toBe(1);
                expect(connection1.receivedMessages[0]).toEqual([[MessageToClient.Greetings, [[expectedUserID, username, [[1]]]], [], []]]);

                const connection2 = new TestConnection('connection 2');
                server.openConnection(connection2);
                connection2.sendMessage([0, username, password, []]);
                await new Promise(resolve => setTimeout(resolve, 0));

                expect(serverManager.connectionIDToConnectionState).toEqual(
                    new Map([[connection1.id, ConnectionState.LoggedIn], [connection2.id, ConnectionState.LoggedIn]]),
                );
                expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map());
                expect(serverManager.clientIDManager.used).toEqual(new Set([1, 2]));
                expectClientAndUser(serverManager, [[expectedUserID, username, [[1, connection1], [2, connection2]]]]);
                expect(connection1.closed).toBe(false);
                expect(connection2.closed).toBe(false);
                expect(connection1.receivedMessages.length).toBe(2);
                expect(connection1.receivedMessages[1]).toEqual([[MessageToClient.ClientConnected, 2, expectedUserID]]);
                expect(connection2.receivedMessages.length).toBe(1);
                expect(connection2.receivedMessages[0]).toEqual([[MessageToClient.Greetings, [[expectedUserID, username, [[1], [2]]]], [], []]]);

                connection2.close();

                expectJustConnection1Data();
                expect(connection2.closed).toBe(true);
                expect(connection1.receivedMessages.length).toBe(3);
                expect(connection1.receivedMessages[2]).toEqual([[MessageToClient.ClientDisconnected, 2]]);
                expect(connection2.receivedMessages.length).toBe(1);

                connection1.close();

                expect(serverManager.connectionIDToConnectionState).toEqual(new Map([]));
                expect(serverManager.connectionIDToPreLoggedInConnection).toEqual(new Map());
                expect(serverManager.clientIDManager.used).toEqual(new Set());
                expectClientAndUser(serverManager, []);
                expect(connection1.closed).toBe(true);
                expect(connection1.receivedMessages.length).toBe(3);
                expect(connection2.receivedMessages.length).toBe(1);
            }

            it('after providing correct password', async () => {
                await getsLoggedIn('has password', 'password', 1);
            });

            it('after not providing a password when it is not set', async () => {
                await getsLoggedIn('does not have password', '', 2);
            });

            it('after not providing a password when user data does not exist', async () => {
                await getsLoggedIn('no user data', '', 3);
            });

            it('user and client info is included in MessageToClient.Greetings message', async () => {
                const { server } = getServerManagerAndStuff();

                await connectToServer(server, 'user 1');
                await connectToServer(server, 'user 2');
                await connectToServer(server, 'user 2');
                await connectToServer(server, 'user 3');
                await connectToServer(server, 'user 4');
                await connectToServer(server, 'user 1');
                const connection = await connectToServer(server, 'me');

                expect(connection.receivedMessages.length).toBe(1);
                expect(connection.receivedMessages[0]).toEqual([
                    [
                        MessageToClient.Greetings,
                        [[1, 'user 1', [[1], [6]]], [2, 'user 2', [[2], [3]]], [3, 'user 3', [[4]]], [4, 'user 4', [[5]]], [5, 'me', [[7]]]],
                        [],
                        [],
                    ],
                ]);
            });

            it('username parameter is excluded if already known in MessageToClient.ClientConnected message', async () => {
                const { server } = getServerManagerAndStuff();

                const connection = await connectToServer(server, 'user 1');
                await connectToServer(server, 'user 2');

                expect(connection.receivedMessages.length).toBe(2);
                expect(connection.receivedMessages[1]).toEqual([[MessageToClient.ClientConnected, 2, 2, 'user 2']]);

                await connectToServer(server, 'user 2');

                expect(connection.receivedMessages.length).toBe(3);
                expect(connection.receivedMessages[2]).toEqual([[MessageToClient.ClientConnected, 3, 2]]);
            });
        });
    });
});

class TestServer {
    connectionListener: ((conn: TestConnection) => any) | null = null;

    on(event: string, listener: (conn: TestConnection) => any) {
        if (event === 'connection') {
            this.connectionListener = listener;
        }
    }

    openConnection(conn: TestConnection) {
        if (this.connectionListener) {
            this.connectionListener(conn);
        }
    }
}

class TestConnection {
    dataListener: ((message: string) => any) | null = null;
    closeListener: (() => void) | null = null;

    receivedMessages: any[] = [];
    closed = false;

    constructor(public id: string) {}

    on(event: string, listener: any) {
        if (event === 'data') {
            this.dataListener = listener;
        } else if (event === 'close') {
            this.closeListener = listener;
        }
    }

    write(message: string) {
        this.receivedMessages.push(JSON.parse(message));
    }

    sendMessage(message: any) {
        if (this.dataListener) {
            if (typeof message !== 'string') {
                message = JSON.stringify(message);
            }
            this.dataListener(message);
        }
    }

    close() {
        this.closed = true;
        if (this.closeListener) {
            this.closeListener();
        }
    }
}

function getServerManagerAndStuff() {
    const server = new TestServer();
    const userDataProvider = new TestUserDataProvider();
    // @ts-ignore
    const serverManager = new ServerManager(server, userDataProvider, 1);
    serverManager.manage();

    return { serverManager, server, userDataProvider };
}

type ClientData = [number, TestConnection];
type UserData = [number, string, ClientData[]];
type UncirclereferenceifiedConnectionIDToClient = Map<string, [number, Connection, number]>;
type UncirclereferenceifiedUserIDToUser = Map<number, [number, string, Set<number>]>;

function expectClientAndUser(serverManager: ServerManager, userDatas: UserData[]) {
    const connectionIDToClient: UncirclereferenceifiedConnectionIDToClient = new Map();
    const userIDToUser: UncirclereferenceifiedUserIDToUser = new Map();

    userDatas.forEach(userData => {
        const [userID, username, clientDatas] = userData;

        const clientIDs = new Set<number>();

        clientDatas.forEach(clientData => {
            const [clientID, connection] = clientData;

            // @ts-ignore
            connectionIDToClient.set(connection.id, [clientID, connection, userID]);

            clientIDs.add(clientID);
        });

        userIDToUser.set(userID, [userID, username, clientIDs]);
    });

    expect(uncirclereferenceifyConnectionIDToClient(serverManager.connectionIDToClient)).toEqual(connectionIDToClient);
    expect(uncirclereferenceifyUserIDToUser(serverManager.userIDToUser)).toEqual(userIDToUser);
}

function uncirclereferenceifyConnectionIDToClient(connectionIDToClient: Map<string, Client>) {
    const uncirclereferenceified: UncirclereferenceifiedConnectionIDToClient = new Map();

    connectionIDToClient.forEach((client, connectionID) => {
        uncirclereferenceified.set(connectionID, [client.id, client.connection, client.user.id]);
    });

    return uncirclereferenceified;
}

function uncirclereferenceifyUserIDToUser(userIDToUser: Map<number, User>) {
    const uncirclereferenceified: UncirclereferenceifiedUserIDToUser = new Map();

    userIDToUser.forEach((user, userID) => {
        const clientIDs = new Set<number>();

        user.clients.forEach(client => {
            clientIDs.add(client.id);
        });

        uncirclereferenceified.set(userID, [user.id, user.name, clientIDs]);
    });

    return uncirclereferenceified;
}

async function connectToServer(server: TestServer, username: string) {
    const connection = new TestConnection(username);
    server.openConnection(connection);
    connection.sendMessage([0, username, '', []]);
    await new Promise(resolve => setTimeout(resolve, 0));

    return connection;
}
