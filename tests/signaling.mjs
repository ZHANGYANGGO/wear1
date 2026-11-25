// Test fixture for repeatable networks: route PeerJS signaling envelopes only.
// ICE negotiation and all game traffic still use the browser's actual WebRTC stack.
export function signalingFixture(){
  const peers=new Map();
  return async context=>context.routeWebSocket("wss://0.peerjs.com/**",socket=>{
    const id=new URL(socket.url()).searchParams.get("id");
    if(peers.has(id)){socket.send(JSON.stringify({type:"ID-TAKEN"}));return;}
    peers.set(id,socket);
    socket.onClose(()=>{if(peers.get(id)===socket)peers.delete(id);});
    socket.onMessage(raw=>{
      const msg=JSON.parse(String(raw));
      if(msg.type==="HEARTBEAT")return;
      if(!["OFFER","ANSWER","CANDIDATE","LEAVE"].includes(msg.type))throw Error("unexpected signaling packet "+msg.type);
      const remote=peers.get(msg.dst);
      if(remote)remote.send(JSON.stringify({...msg,src:id}));
      else if(msg.type==="OFFER")socket.send(JSON.stringify({type:"EXPIRE",src:msg.dst,payload:msg.payload}));
    });
    socket.send(JSON.stringify({type:"OPEN"}));
  });
}

