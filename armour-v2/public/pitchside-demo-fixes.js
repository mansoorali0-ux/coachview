(function(){
  function n(text,label){
    var i=text.indexOf(label);
    if(i<0)return null;
    var before=text.slice(0,i).match(/[+-]?\d+(?:\.\d+)?\s*$/);
    if(before)return parseFloat(before[0]);
    var after=text.slice(i+label.length).match(/[+-]?\d+(?:\.\d+)?/);
    return after?parseFloat(after[0]):null;
  }
  function mins(text){
    var m=(text||'').match(/(\d+)'\s*MINS/i);
    return m?parseFloat(m[1]):0;
  }
  function score(el){
    var t=el.textContent||'';
    return {impact:n(t,'IMPACT SCORE'),net:n(t,'NET/80'),mins:mins(t)};
  }
  function container(){
    var all=Array.from(document.querySelectorAll('div'));
    var best=null,bestCount=0;
    all.forEach(function(x){
      var kids=Array.from(x.children||[]);
      var count=kids.filter(function(k){
        var t=k.textContent||'';
        return t.indexOf('IMPACT SCORE')>-1&&t.indexOf('NET/80')>-1&&t.indexOf('MINS')>-1&&t.length<900;
      }).length;
      if(count>bestCount){best=x;bestCount=count;}
    });
    return bestCount>=3?best:null;
  }
  function mode(){
    var btns=Array.from(document.querySelectorAll('button'));
    var b=btns.find(function(x){
      var t=(x.textContent||'').toLowerCase();
      return t.indexOf('net')>-1||t.indexOf('impact')>-1;
    });
    return b&&(b.textContent||'').toLowerCase().indexOf('net')>-1?'net':'impact';
  }
  function sortCards(){
    var p=container();
    if(!p)return;
    var m=mode();
    var rows=Array.from(p.children).filter(function(k){
      var t=k.textContent||'';
      return t.indexOf('IMPACT SCORE')>-1&&t.indexOf('NET/80')>-1&&t.indexOf('MINS')>-1&&t.length<900;
    });
    if(rows.length<3)return;
    var parsed=rows.map(function(el,i){
      var s=score(el);
      return {el:el,i:i,impact:s.impact==null?-999:s.impact,net:s.net==null?-999:s.net,mins:s.mins||0};
    });
    parsed.sort(function(a,b){
      if(m==='net')return (b.net-a.net)||(b.impact-a.impact)||(b.mins-a.mins)||(a.i-b.i);
      return (b.impact-a.impact)||(b.net-a.net)||(b.mins-a.mins)||(a.i-b.i);
    });
    parsed.forEach(function(x){p.appendChild(x.el);});
  }
  function loop(){sortCards();}
  window.addEventListener('load',function(){setTimeout(loop,1200);setInterval(loop,1500);});
})();
