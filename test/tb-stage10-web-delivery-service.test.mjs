import test from 'node:test';
import assert from 'node:assert/strict';
import { createTbStage10WebDeliveryService } from '../tb-stage10-web-delivery-service.mjs';

const context = Object.freeze({
  guild:{id:'guild-1',name:'Test Guild'},
  userId:'user-1',
  discordGuildId:'123456789012345678',
  seedAllyCode:'732764286',
});

function fixture() {
  const calls = [];
  const stage10Factory = ({contextResolver}) => ({
    async preview(interaction) {
      calls.push(['preview',await contextResolver.resolve(interaction),interaction]);
      return {mode:'preview'};
    },
    async publish(interaction) {
      calls.push(['publish',await contextResolver.resolve(interaction),interaction]);
      return {mode:'published'};
    },
    async status(interaction) {
      calls.push(['status',await contextResolver.resolve(interaction),interaction]);
      return {mode:'status'};
    },
  });
  return { calls, service:createTbStage10WebDeliveryService({stage10Factory}) };
}

function options(interaction) {
  return Object.fromEntries(interaction.data.options[0].options.map((row) => [row.name,row.value]));
}

test('web preview injects server officer context into the existing Stage 10 engine', async () => {
  const {service,calls}=fixture();
  await service.preview(context,{phase:'P6',versionNumber:4,includeMentions:true});
  const call=calls[0];
  assert.equal(call[0],'preview');
  assert.equal(call[1].guild.id,'guild-1');
  assert.equal(call[1].userId,'user-1');
  assert.equal(call[1].discordGuildId,'123456789012345678');
  assert.equal(call[2].guild_id,'123456789012345678');
  assert.deepEqual(options(call[2]),{phase:'P6',version:4,mentions:'on'});
});

test('web adapter rejects website-only context before constructing Stage 10 delivery', async () => {
  const {service,calls}=fixture();
  await assert.rejects(
    () => service.preview({guild:{id:'guild-1'},userId:'user-1',discordGuildId:''},{phase:'P6',versionNumber:4}),
    (error)=>error?.status===409 && error?.code==='DISCORD_GUILD_REQUIRED',
  );
  assert.equal(calls.length,0);
});

test('web publish converts explicit website confirmation into the same Stage 10 option contract', async () => {
  const {service,calls}=fixture();
  const hash='a'.repeat(64);
  const result=await service.publish(context,{phase:'P3',versionNumber:2,includeMentions:false,channelId:'223456789012345678',confirm:'PUBLISH',planHash:hash});
  assert.equal(result.mode,'published');
  const call=calls[0];
  assert.equal(call[0],'publish');
  assert.deepEqual(options(call[2]),{
    phase:'P3',version:2,mentions:'off',channel:'223456789012345678',action:'publish',confirm:'PUBLISH',hash,
  });
});

test('web adapter rejects publish without explicit PUBLISH confirmation before Stage 10 call', async () => {
  const {service,calls}=fixture();
  await assert.rejects(
    () => service.publish(context,{phase:'P1',versionNumber:1,planHash:'a'.repeat(64)}),
    (error)=>error?.code==='STAGE10_EXPLICIT_CONFIRMATION_REQUIRED',
  );
  assert.equal(calls.length,0);
});

test('web adapter rejects missing or too-short immutable hash before Stage 10 call', async () => {
  const {service,calls}=fixture();
  await assert.rejects(
    () => service.publish(context,{phase:'P1',versionNumber:1,confirm:'PUBLISH',planHash:'abc'}),
    (error)=>error?.code==='STAGE10_HASH_CONFIRMATION_REQUIRED',
  );
  assert.equal(calls.length,0);
});

test('client cannot replace injected Discord Guild identity through Stage 10 input', async () => {
  const {service,calls}=fixture();
  await service.status(context,{phase:'P2',versionNumber:7,discordGuildId:'999999999999999999'});
  assert.equal(calls[0][1].discordGuildId,'123456789012345678');
  assert.equal(calls[0][2].guild_id,'123456789012345678');
});
