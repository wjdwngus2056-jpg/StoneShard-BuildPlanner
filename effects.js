/* Data-only formula rendering. External descriptions are never executed as JavaScript. */
(function (root) {
  const symbols = {
    str:'근력',agi:'민첩성',per:'인지력',vit:'생명력',wil:'의지력',
    mag:'마법 위력',blk_chance:'방어 확률',max_blk_pow:'최대 방어력',
    boots_def:'신발 방어력',main_hand:'주 무기 피해',off_hand:'보조 무기 피해',skill_cnt:'관련 기술 수'
  };
  const escapeHTML = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function evaluateExpression(expression, values = {}) {
    if (expression.length > 200) return null;
    const tokens = expression.match(/\d+(?:\.\d+)?|[a-z_]+|[()+*/-]/g) || [];
    if (tokens.join('') !== expression.replace(/\s/g,'')) return null;
    let position = 0;
    function primary() {
      const token=tokens[position++];
      if(token==='+')return primary();
      if(token==='-')return -primary();
      if(token==='('){const value=sum();if(tokens[position++]!==')')throw new Error('Unclosed expression');return value;}
      if(token && /^\d/.test(token))return Number(token);
      if(token && /^[a-z_]+$/.test(token))return Object.hasOwn(values,token)&&Number.isFinite(values[token])?values[token]:NaN;
      throw new Error('Invalid expression');
    }
    function product(){let value=primary();while(tokens[position]==='*'||tokens[position]==='/'){const op=tokens[position++],next=primary();value=op==='*'?value*next:value/next;}return value;}
    function sum(){let value=product();while(tokens[position]==='+'||tokens[position]==='-'){const op=tokens[position++],next=product();value=op==='+'?value+next:value-next;}return value;}
    try{const value=sum();return position===tokens.length&&Number.isFinite(value)?Math.round(value*100)/100:null;}catch{return null;}
  }
  function formulaLabel(expression) {
    return expression.replace(/[a-z_]+/g,key=>symbols[key]||key).replace(/\*/g,' × ').replace(/\//g,' ÷ ').replace(/\+/g,' + ').replace(/-/g,' − ').replace(/\s+/g,' ').trim();
  }
  function valuesFor(stats) {return {str:stats.strength,agi:stats.agility,per:stats.perception,vit:stats.vitality,wil:stats.willpower};}
  function plainText(text,stats) {
    const values=valuesFor(stats);
    return text.replace(/\$\{([^{}]+)\}/g,(_,expression)=>{
      const result=evaluateExpression(expression,values);
      return result===null?`(${formulaLabel(expression)})`:String(Object.is(result,-0)?0:result);
    });
  }
  function renderText(text,stats) {
    return escapeHTML(plainText(text,stats)).replace(/##([^#\n]+)#([1-4])/g,(_,label,element)=>`<span class="effect-element element-${element}">${label}</span>`).replace(/\[\[([^\[\]\n]+)\]\]|\[([^\[\]\n]+)\]|\{([^{}\n]+)\}/g,(_,status,number,term)=>
      `<span class="${status?'effect-status':number?'effect-number':'effect-term'}">${status||number||term}</span>`).replace(/[{}]/g,'');
  }
  function missingVariables(text) {
    const variables = [...text.matchAll(/\$\{([^{}]+)\}/g)].flatMap(match=>match[1].match(/[a-z_]+/g)||[]);
    return [...new Set(variables.filter(key=>!['str','agi','per','vit','wil'].includes(key)))];
  }
  const api={evaluateExpression,formulaLabel,plainText,renderText,missingVariables,escapeHTML};
  root.WayfarerEffects=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
