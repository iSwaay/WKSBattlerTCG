(function(){
  var st=document.getElementById('pk-stage'); if(!st) return;
  function setPack(w){
    st.setAttribute('data-active',w);
    ['std','mega'].forEach(function(k){
      var it=document.getElementById('pk-item-'+k), on=(k===w);
      it.classList.toggle('on',on); it.classList.toggle('off',!on);
      var b=it.querySelector('.pack'); if(b) b.tabIndex=on?0:-1;
      var wr=it.querySelector('.pack-wrap'); if(wr&&!on) reset(wr);
    });
    document.getElementById('slide-standard').style.display=(w==='std')?'flex':'none';
    document.getElementById('slide-mega').style.display=(w==='mega')?'flex':'none';
  }
  window.__setPack=setPack;
  function reset(wr){ wr.classList.remove('hov'); ['--rx','--ry','--tx','--ty'].forEach(function(v){wr.style.removeProperty(v);}); }
  function tilt(e){
    var it=st.querySelector('.pk-item.on'); if(!it) return;
    var wr=it.querySelector('.pack-wrap'), r=it.getBoundingClientRect();
    var x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    if(x<-.15||x>1.15||y<-.1||y>1.1){ reset(wr); return; }
    x=Math.max(0,Math.min(1,x)); y=Math.max(0,Math.min(1,y));
    wr.classList.add('hov');
    wr.style.setProperty('--ry',((x-.5)*2*13).toFixed(2)+'deg');
    wr.style.setProperty('--rx',((.5-y)*2*13).toFixed(2)+'deg');
    wr.style.setProperty('--tx',((x-.5)*2).toFixed(3));
    wr.style.setProperty('--ty',((y-.5)*2).toFixed(3));
    wr.style.setProperty('--mx',(x*100).toFixed(1)+'%');
    wr.style.setProperty('--my',(y*100).toFixed(1)+'%');
  }
  var sx=null;
  st.addEventListener('pointermove',tilt);
  st.addEventListener('pointerdown',function(e){ sx=e.clientX; tilt(e); });
  st.addEventListener('pointerup',function(e){
    if(sx!==null && Math.abs(e.clientX-sx)>55){ setPack(e.clientX<sx?'mega':'std'); }
    sx=null;
    if(e.pointerType==='touch'){ var wr=st.querySelector('.pk-item.on .pack-wrap'); if(wr) setTimeout(function(){reset(wr);},350); }
  });
  st.addEventListener('pointerleave',function(){ var wr=st.querySelector('.pk-item.on .pack-wrap'); if(wr) reset(wr); });
  st.addEventListener('click',function(e){ var it=e.target.closest('.pk-item.off'); if(it){ e.stopPropagation(); setPack(it.getAttribute('data-k')); } },true);
  setPack('std');
})();
