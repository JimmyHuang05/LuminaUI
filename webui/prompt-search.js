/* Local bilingual search. No requests, models, or generated translations. */
(function(root){
  'use strict';
  const groups=[
    ['婚纱','婚紗','wedding dress','wedding gown','bridal gown'],
    ['新娘','bride','bridal'],['婚礼','婚禮','wedding'],
    ['海边','海邊','海岸','海滩','沙滩','沙灘','beach','seaside','coast','shore'],
    ['海洋','大海','海水','ocean','sea'],['泳池','游泳池','swimming pool','poolside'],
    ['逆光','背光','backlight','backlit','backlighting'],['轮廓光','輪廓光','rim light','rim lighting'],
    ['闪光灯','閃光燈','flash','on-camera flash'],['自然光','日光','natural light','daylight'],
    ['柔光','soft light','soft lighting'],['烛光','燭光','candlelight','candlelit'],
    ['夕阳','落日','日落','sunset'],['黄金时刻','golden hour'],['夜景','夜晚','night','nighttime'],
    ['室内','室內','indoor','indoors','interior'],['户外','室外','outdoor','outdoors'],
    ['卧室','臥室','bedroom'],['客厅','客廳','living room'],['浴室','bathroom'],
    ['厨房','廚房','kitchen'],['窗边','窗旁','窗邊','by a window','beside a window','windowside'],
    ['街头','街道','街頭','street'],['城市','都市','city','urban'],['森林','树林','forest','woods'],
    ['花园','花園','garden'],['草地','草坪','lawn','grass'],['雪景','雪地','snow'],
    ['咖啡馆','咖啡店','cafe','café','coffee shop'],['餐厅','餐廳','restaurant'],
    ['芭蕾','ballet'],['舞蹈','跳舞','dance','dancing'],['足尖鞋','pointe shoes'],
    ['连体舞衣','芭蕾舞衣','leotard'],['纱裙','紗裙','tutu','tulle skirt'],
    ['连衣裙','連衣裙','dress','dresses'],['短裙','迷你裙','miniskirt','mini skirt'],
    ['卫衣','衛衣','hoodie','hooded sweatshirt'],['毛衣','sweater','knitwear'],
    ['衬衫','襯衫','shirt'],['和服','kimono'],['西装','西裝','suit'],
    ['泳装','泳衣','泳裝','swimsuit','swimwear'],['比基尼','bikini'],
    ['内衣','內衣','lingerie','underwear'],['蕾丝','蕾絲','lace'],
    ['丝袜','絲襪','stockings','hosiery'],['连裤袜','連褲襪','tights','pantyhose'],
    ['高跟鞋','high heels','high-heeled shoes'],['靴子','长靴','boots'],
    ['透明','translucent','transparent','see-through'],['薄纱','薄紗','sheer','gauze'],
    ['缎面','綢緞','satin'],['丝绸','絲綢','silk'],['皮革','leather'],
    ['毛绒','毛絨','faux fur','fluffy'],['棉质','棉布','cotton'],
    ['白色','white'],['黑色','black'],['红色','紅色','red'],['蓝色','藍色','blue'],
    ['粉色','粉红','pink'],['紫色','purple','lavender'],['绿色','綠色','green'],['金色','golden','gold'],
    ['长发','長髮','long hair'],['短发','短髮','short hair'],['卷发','捲髮','curly hair','wavy hair'],
    ['马尾','馬尾','ponytail'],['金发','金髮','blonde','blond'],
    ['回头','回眸','looking back','over the shoulder','over-the-shoulder'],
    ['坐姿','坐着','seated','sitting'],['站姿','站立','standing'],['躺着','躺姿','lying','reclining'],
    ['侧脸','側臉','profile view','side profile'],['背影','背面','rear view','back view'],
    ['俯拍','俯视','俯視','high angle','high-angle','overhead'],
    ['仰拍','低角度','low angle','low-angle'],['特写','特寫','close-up','closeup'],
    ['全身','full body','full-body'],['半身','upper body','waist-up'],
    ['自拍','selfie'],['人像','肖像','portrait'],['写真','摄影','寫真','photography','photograph'],
    ['写实','寫實','realistic','photorealistic'],['胶片','膠片','film grain','analog film'],
    ['复古','復古','vintage','retro'],['电影感','電影感','cinematic'],
    ['动漫','動畫','anime'],['插画','插畫','illustration'],['油画','油畫','oil painting'],
    ['台球','桌球','billiards','pool table'],['手机','手機','smartphone','mobile phone'],
    ['眼镜','眼鏡','glasses','eyeglasses'],['花束','捧花','bouquet'],
    ['g','g级','g級','全年龄','全年齡','sfw'],['r15','r-15','r 15'],['r18','r-18','r 18','nsfw']
  ];
  const related=[['婚纱','新娘','婚礼'],['海边','海洋'],['逆光','轮廓光'],['夕阳','黄金时刻'],['芭蕾','足尖鞋','连体舞衣','纱裙'],['泳装','比基尼'],['丝袜','连裤袜']];
  const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
  const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const aliases=groups.flatMap((terms,id)=>terms.map(term=>({term:normalize(term),id}))).sort((a,b)=>b.term.length-a.term.length);
  const byName=new Map(groups.map((terms,id)=>[terms[0],id]));
  const links=new Map();
  for(const set of related)for(const name of set){const id=byName.get(name);if(!links.has(id))links.set(id,new Set());for(const other of set)if(other!==name)links.get(id).add(byName.get(other));}
  const contains=(text,term)=>/^[a-z0-9 -]+$/.test(term)?new RegExp('(^|[^a-z0-9])'+escape(term)+'(?![a-z0-9])','u').test(text):text.includes(term);
  function terms(query){
    const result=[];let rest=normalize(query);
    while(rest){
      const match=aliases.find(a=>rest.startsWith(a.term)&&(!/[a-z0-9]$/.test(a.term)||!/[a-z0-9]/.test(rest[a.term.length]||'')));
      if(match){result.push({text:match.term,id:match.id});rest=rest.slice(match.term.length);continue;}
      if(/^[\s,，、;；]+/.test(rest)){rest=rest.replace(/^[\s,，、;；]+/,'');continue;}
      const word=rest.match(/^[a-z0-9]+(?:[-'][a-z0-9]+)*/);
      if(word){result.push({text:word[0]});rest=rest.slice(word[0].length);continue;}
      let length=1;
      while(length<rest.length&&!/[\s,，、;；]/.test(rest[length])&&!aliases.some(a=>rest.startsWith(a.term,length)))length++;
      result.push({text:rest.slice(0,length)});rest=rest.slice(length);
    }
    return result.filter(t=>!['的','和','与','及','and','with','a','an','the'].includes(t.text));
  }
  function fields(row){
    return [[row.title,8],[(row.tags||[]).join(' '),7],[row.card_summary,6],
      [Object.values(row.module_summaries||{}).join(' '),5],[row.prompt,3],
      [({moody_krea2:'Moody Krea2',qwen:'Qwen'}[row.prompt_series]||row.prompt_series),3],
      [row.content_rating?.level,2],[row.source_url,1]].map(([text,weight])=>[normalize(text),weight]);
  }
  function score(data,tokens,query){
    let total=0,weakest=3;
    for(const token of tokens){
      let quality=0,weight=0;
      const same=token.id===undefined?[]:groups[token.id];
      const near=token.id===undefined?[]:[...(links.get(token.id)||[])].flatMap(id=>groups[id]);
      for(const [text,w] of data){
        const q=contains(text,token.text)?3:same.some(t=>contains(text,normalize(t)))?2:near.some(t=>contains(text,normalize(t)))?1:0;
        if(q>quality||(q===quality&&w>weight)){quality=q;weight=w;}
      }
      if(!quality)return 0;
      weakest=Math.min(weakest,quality);total+=quality*10+weight;
    }
    return weakest*10000+total+ (data.some(([text])=>contains(text,query))?50:0);
  }
  function search(rows,query){
    query=normalize(query);const tokens=terms(query);
    const used=row=>Date.parse(row.last_used_at||'')||0;
    return rows.map((row,index)=>({row,index,score:query?tokens.length?score(fields(row),tokens,query):0:1}))
      .filter(item=>item.score>0).sort((a,b)=>b.score-a.score||used(b.row)-used(a.row)||a.index-b.index).map(item=>item.row);
  }
  const api={search};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.promptSearch=api;
})(typeof window==='undefined'?globalThis:window);
