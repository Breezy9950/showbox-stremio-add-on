import {getStore} from "@netlify/blobs";

const CONFIG_STORE="showbox-configs";
const HOMEPAGE_SESSION_STORE="showbox-homepage-sessions";
const CONFIGURE_SESSION_STORE="showbox-configure-sessions";

const HOMEPAGE_SESSION_TTL_MS=60*60*1000;
const CONFIGURE_SESSION_TTL_MS=5*60*1000;

function getStoreByName(name){
  return getStore({
    name,
    consistency:"strong"
  });
}

function validId(id){
  return (
    typeof id==="string"&&
    /^[a-f0-9]{32}$/i.test(id)
  );
}

function createId(){
  return crypto.randomUUID().replace(/-/g,"");
}

export async function createConfig(config){
  const store=getStoreByName(
    CONFIG_STORE
  );

  const id=createId();

  await store.setJSON(
    id,
    config,
    {
      onlyIfNew:true
    }
  );

  return id;
}

export async function getConfig(id){
  if(!validId(id)){
    return null;
  }

  const store=getStoreByName(
    CONFIG_STORE
  );

  return await store.get(
    id,
    {
      type:"json",
      consistency:"strong"
    }
  );
}

export async function saveConfig(
  id,
  config
){
  if(!validId(id)){
    throw new Error(
      "Invalid configuration ID"
    );
  }

  const store=getStoreByName(
    CONFIG_STORE
  );

  await store.setJSON(
    id,
    config
  );
}

async function createSession(
  storeName,
  ttlMs,
  data={}
){
  const store=getStoreByName(
    storeName
  );

  const id=createId();

  const createdAt=
    Date.now();

  const expiresAt=
    createdAt+ttlMs;

  await store.setJSON(
    id,
    {
      ...data,
      createdAt,
      expiresAt
    },
    {
      onlyIfNew:true
    }
  );

  return {
    id,
    createdAt,
    expiresAt
  };
}

async function getActiveSession(
  storeName,
  id
){
  if(!validId(id)){
    return null;
  }

  const store=getStoreByName(
    storeName
  );

  const session=
    await store.get(
      id,
      {
        type:"json",
        consistency:"strong"
      }
    );

  if(
    !session||
    typeof session!=="object"
  ){
    return null;
  }

  const expiresAt=
    Number(session.expiresAt);

  if(!Number.isFinite(expiresAt)){
    return null;
  }

  if(
    Date.now()>=expiresAt
  ){
    return null;
  }

  return session;
}

export async function createHomepageSession(){
  return await createSession(
    HOMEPAGE_SESSION_STORE,
    HOMEPAGE_SESSION_TTL_MS
  );
}

export async function getHomepageSession(
  id
){
  return await getActiveSession(
    HOMEPAGE_SESSION_STORE,
    id
  );
}

export async function setHomepageSessionToken(
  id,
  uiToken
){
  if(
    typeof uiToken!=="string"||
    !uiToken
  ){
    throw new Error(
      "ShowBox UI token is required"
    );
  }

  const store=
    getStoreByName(
      HOMEPAGE_SESSION_STORE
    );

  const session=
    await getActiveSession(
      HOMEPAGE_SESSION_STORE,
      id
    );

  if(!session){
    throw new Error(
      "Configuration session is invalid or expired"
    );
  }

  await store.setJSON(
    id,
    {
      ...session,
      uiToken
    }
  );
}

export async function createConfigureSession(){
  return await createSession(
    CONFIGURE_SESSION_STORE,
    CONFIGURE_SESSION_TTL_MS
  );
}

export async function getConfigureSession(
  id
){
  return await getActiveSession(
    CONFIGURE_SESSION_STORE,
    id
  );
}
