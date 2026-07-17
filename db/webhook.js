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
      const activeUsersArray = Array.from(activeUsers);
      const message = JSON.stringify({
        type: "userUpdate",
        message: activeUsersArray,
      });
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
    const message = JSON.parse(bytes.toString());
    const connection = connections.get(connectionId);

    if (message.updateUser) {
      connection.userId = message.updateUser.uuid;
      connections.set(connectionId, connection);
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
      activeUsers[connection.userId].votes = message.votes;
    }

    if (message.startVoting) {
      voting.votingOpen = true;
      voting.hostId = connectionId;
      broadcastVoteInitiation(uuid);
    }

    broadcastUpdate();
  };

  const handleClose = (connectionId) => {
    const connection = connections.get(connectionId);
    if (connection.userId) {
      activeUsers.delete(connection.userId);
    }

    connections.delete(connectionId);
    voting.votingOpen = false;
    voting.hostId = null;
    broadcastUpdate();
  };

  wsServer.on("connection", (socket, request) => {
    const connectionId = crypto.randomUUID();
    connections.set(connectionId, {
      socket,
      userId: null,
    });

    socket.on("message", (message) => handleMessage(message, connectionId));
    socket.on("close", () => handleClose(connectionId));
  });

  server.listen(port, () => {});

  return { server, wsServer, connections, activeUsers, voting };
};

module.exports = { createWebhookServer };
