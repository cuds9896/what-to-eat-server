const http = require("http");
const { WebSocketServer } = require("ws");
const uuidv4 = require("uuid").v4;

const createWebhookServer = ({ port = 8000 } = {}) => {
  const server = http.createServer();
  const wsServer = new WebSocketServer({ server });
  const connections = new Map();
  const activeUsers = new Map();
  const voting = { votingOpen: false, hostId: null };

  const broadcastUpdate = () => {
    connections.forEach((connection, uuid) => {
      console.log("connection: " + typeof connection);
      console.log("activeUsers: " + activeUsers);
      const activeUsersArray = Array.from(activeUsers);
      console.log(activeUsersArray);
      const message = JSON.stringify({
        type: "userUpdate",
        message: activeUsersArray,
      });
      console.log("broadcasting...");
      connection.socket.send(message);
    });
  };

  const broadcastVoteInitiation = (hostId) => {
    Object.keys(connections).forEach((uuid) => {
      const connection = connections[uuid];
      const message = JSON.stringify({
        type: "startVoting",
        message: { hostId },
      });
      connection.send(message);
    });
  };

  const handleMessage = (bytes, connectionId) => {
    console.log(
      `incoming message from WS: ${bytes} ${typeof bytes} ${typeof connectionId}`,
    );
    const message = JSON.parse(bytes.toString());
    const connection = connections.get(connectionId);

    if (message.updateUser) {
      connection.userId = message.updateUser.uuid;
      connections.set(connectionId, connection);
      console.log("activeUsers set: ", message.updateUser.uuid);
      activeUsers.set(message.updateUser.uuid, {
        username: message.updateUser.username,
        connectionId: connectionId,
        votes: [],
        recipes: [],
      });
      broadcastUpdate();
      return;
    }

    if (!connection.userId) {
      return;
    }

    if (message.votes && message.votes.length > 0) {
      console.log(`User ${user.username} updated their votes.`);
      activeUsers[connection.userId].votes = message.votes;
    }

    if (message.startVoting) {
      console.log(`User ${user.username} started voting.`);
      voting.votingOpen = true;
      voting.hostId = connectionId;
      broadcastVoteInitiation(uuid);
    }

    broadcastUpdate();
    console.log(`Received message:`, message);
  };

  const handleClose = (connectionId) => {
    const connection = connections.get(connectionId);
    if (connection.userId) {
      console.log(`Client disconnected: ${connection.userId}`);
      activeUsers.delete(connection.userId);
    }

    connections.delete(connectionId);
    voting.votingOpen = false;
    voting.hostId = null;
    broadcastUpdate();
  };

  wsServer.on("connection", (socket, request) => {
    console.log("Client connected");
    const connectionId = crypto.randomUUID();
    console.log(connectionId);
    connections.set(connectionId, {
      socket,
      userId: null,
    });

    socket.on("message", (message) => handleMessage(message, connectionId));
    socket.on("close", () => handleClose(connectionId));
  });

  server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
  });

  return { server, wsServer, connections, activeUsers, voting };
};

module.exports = { createWebhookServer };
