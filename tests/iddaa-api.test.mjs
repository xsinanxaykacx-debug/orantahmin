import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/iddaa-markets.ts";

test("iddaa market API returns every market for a requested public event",async()=>{
  const originalFetch=globalThis.fetch;
  const event={
    i:123,sid:1,hn:"Home",an:"Away",d:1795700000,
    m:[
      {t:1,st:1,o:[{no:1,n:"1",odd:1.8},{no:2,n:"X",odd:3.2},{no:3,n:"2",odd:4.1}]},
      {t:2,st:89,o:[{no:1,n:"Var",odd:1.7},{no:2,n:"Yok",odd:2.0}]}
    ]
  };
  globalThis.fetch=async(url)=>{
    if(String(url).includes("get_market_config")) return {
      ok:true,json:async()=>({isSuccess:true,data:{m:{"1_1":{n:"Maç Sonucu"},"2_89":{n:"Karşılıklı Gol"}}}})
    };
    return {ok:true,json:async()=>({isSuccess:true,data:[{events:[event]}]})};
  };
  const response = {
    headers:{},statusCode:200,body:null,
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
  try {
    await handler({method:"GET",query:{eventId:"123"}},response);
    assert.equal(response.statusCode,200);
    assert.equal(response.body.available,true);
    assert.equal(response.body.source,"iddaa.com");
    assert.equal(response.body.markets.length,2);
    assert.equal(response.body.markets[0].name,"Maç Sonucu");
    assert.equal(response.body.markets[1].outcomes.length,2);
  } finally {
    globalThis.fetch=originalFetch;
  }
});
