import test from "node:test";
import assert from "node:assert/strict";
import { buildGuildUnitOwnershipMatrix, guildOperationUnitsForPhase } from "../public/guild-unit-ownership-model.js";

const ops={slots:[
{id:"1",phase:"P1",baseId:"X",name:"Unit X",unitType:"Character",requiredRarity:7,requiredRelic:5},
{id:"2",phase:"P1",baseId:"X",name:"Unit X",unitType:"Character",requiredRarity:7,requiredRelic:7},
{id:"3",phase:"P1",baseId:"Y",name:"Unit Y",unitType:"Character",requiredRarity:7,requiredRelic:5},
]};
const unit=(baseId,relic,power=30000)=>({baseId,unitType:"Character",stars:7,gear:13,relic,power});
const member=(id,name,units)=>({playerId:id,allyCode:id==="a"?"111222333":"444555666",name,galacticPower:9000000,rosterAvailable:true,units});

test("aggregates unique Operation units and max phase requirement",()=>{
 const rows=guildOperationUnitsForPhase(ops,"P1");
 assert.equal(rows[0].baseId,"X"); assert.equal(rows[0].demand,2); assert.equal(rows[0].maxRequirement.requiredRelic,7);
});

test("matrix separates GIVE safe protected KEEP below and missing owners",()=>{
 const guild={members:[member("a","Alpha",[unit("X",7,35000)]),member("b","Beta",[unit("X",5,30000)]),member("c","Gamma",[])]};
 const matrix=buildGuildUnitOwnershipMatrix({guildSnapshot:guild,operations:ops,phase:"P1",baseId:"X",preferences:[{memberId:"a",baseId:"X",preference:"give"},{memberId:"b",baseId:"X",preference:"keep"}],protections:[{memberId:"b",phase:"P1",baseId:"X",severity:100,reasons:["mission"]}],assignments:[{phase:"P1",baseId:"X",member:{playerId:"a"}}]});
 assert.equal(matrix.summary.demand,2); assert.equal(matrix.summary.owners,2); assert.equal(matrix.summary.qualifyingOwners,2); assert.equal(matrix.summary.safeOwners,1); assert.equal(matrix.summary.keepOwners,1); assert.equal(matrix.summary.missingMembers,1);
 assert.equal(matrix.members[0].band,"give"); assert.equal(matrix.members[0].assigned,1); assert.equal(matrix.members.at(-1).band,"missing");
});

test("owner qualifying depth reflects different slot gates",()=>{
 const guild={members:[member("a","Alpha",[unit("X",5)]),member("b","Beta",[unit("X",7)])]};
 const matrix=buildGuildUnitOwnershipMatrix({guildSnapshot:guild,operations:ops,phase:"P1",baseId:"X"});
 const alpha=matrix.members.find(r=>r.id==="a"), beta=matrix.members.find(r=>r.id==="b");
 assert.equal(alpha.qualifyingSlots,1); assert.equal(beta.qualifyingSlots,2);
});
