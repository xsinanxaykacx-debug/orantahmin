import test from "node:test";
import assert from "node:assert/strict";
import { FIELD_COUNT } from "../scripts/iddaa/schema.ts";
import { parseIddaaMarkets, transformIddaaEvent, transformIddaaPayload } from "../scripts/iddaa/transform.ts";

const sample = {
  isSuccess:true,
  data:[{events:[{
    i:12345,sid:1,hn:"Ev Sahibi",an:"Deplasman",d:1795700000,ci:77,mbc:1,
    m:[
      {t:1,st:1,o:[{no:1,n:"1",odd:1.8},{no:2,n:"X",odd:3.4},{no:3,n:"2",odd:4.2}]},
      {t:2,st:92,o:[{no:1,n:"1X",odd:1.2},{no:2,n:"12",odd:1.3},{no:3,n:"X2",odd:1.8}]},
      {t:2,st:101,sov:"2.5",o:[{no:1,n:"Alt",odd:1.9},{no:2,n:"Üst",odd:1.9}]},
      {t:2,st:89,o:[{no:1,n:"Var",odd:1.7},{no:2,n:"Yok",odd:2.0}]}
    ]
  }]}]
};

test("iddaa response maps to the stable 61-slot compatibility row",()=>{
  const result=transformIddaaPayload(sample);
  assert.equal(result.matches.length,1);
  assert.equal(result.meta.sourceFieldCount,61);
  assert.equal(result.matches[0].raw.length,FIELD_COUNT);
  assert.equal(result.matches[0].fields.ms1,1.8);
  assert.equal(result.matches[0].fields.msX,3.4);
  assert.equal(result.matches[0].fields.ms2,4.2);
  assert.equal(result.matches[0].fields.doubleChance1X,1.2);
  assert.equal(result.matches[0].fields.goals25Under,1.9);
  assert.equal(result.matches[0].fields.bttsYes,1.7);
  const retainedMarkets = result.matches[0].fields.iddaaMarkets;\n  assert.ok(Array.isArray(retainedMarkets));\n  assert.equal(retainedMarkets.length,4);
});
test("unknown markets are retained rather than discarded",()=>{
  const event=sample.data[0].events[0];
  event.m.push({t:2,st:999,sov:"line",o:[{no:1,n:"A",odd:2.1}]});
  const markets=parseIddaaMarkets(event);
  assert.equal(markets.length,5);
  assert.equal(markets[4].name,"Market 2:999");
});
test("unsuccessful and empty feed responses are rejected",()=>{
  assert.throws(()=>transformIddaaPayload({isSuccess:false,data:[]}));
  assert.throws(()=>transformIddaaPayload({isSuccess:true,data:[{events:[]}]}));
});
test("non-football events are not included",()=>{
  const payload=structuredClone(sample);
  payload.data[0].events.push({...payload.data[0].events[0],i:12346,sid:2});
  assert.equal(transformIddaaPayload(payload).matches.length,1);
});
