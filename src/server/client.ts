import type { Room } from './room';

export class Client {
	room: Room | undefined;

	userID: number | undefined;
	username: string | undefined;

	constructor(public clientID: number) {}

	connectToRoom(room: Room) {
		this.disconnectFromRoom();

		this.room = room;
		room.clientConnected(this);
	}

	disconnectFromRoom() {
		if (this.room) {
			this.room.clientDisconnected(this);
			this.room = undefined;
		}
	}

	loggedIn(userID: number, username: string) {
		this.userID = userID;
		this.username = username;

		this.room?.clientLoggedIn(this);
	}

	loggedOut() {
		this.room?.clientLoggedOut(this);

		this.userID = undefined;
		this.username = undefined;
	}
}
