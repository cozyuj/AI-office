// 말줄임표로 잘린 텍스트에 마우스를 올리면 전체 내용을 작은 툴팁으로 보여준다.
// 대상: data-tip 속성이 있는 요소. 잘리지 않았으면(넘침 없음) 띄우지 않는다. force 가 있으면 항상.
export function initTextTips() {
  const el = document.createElement('div');
  el.id = 'texttip';
  el.className = 'texttip hidden';
  document.body.appendChild(el);
  let current = null;

  function overflowing(node) {
    const target = node.matches('[data-tip]') ? node : node.closest('[data-tip]');
    if (!target) return null;
    const probe = target.querySelector('.ellipsis') || target;
    const cut = probe.scrollWidth > probe.clientWidth + 1 || [...target.querySelectorAll('*')].some((c) => c.scrollWidth > c.clientWidth + 1);
    return cut || target.dataset.tipForce !== undefined ? target : null;
  }

  function show(target) {
    current = target;
    el.textContent = target.dataset.tip;
    el.classList.remove('hidden');
    const r = target.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + w > window.innerWidth - 8) x = Math.max(8, window.innerWidth - w - 8);
    if (y + h > window.innerHeight - 8) y = r.top - h - 6;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
  }
  function hide() { current = null; el.classList.add('hidden'); }

  document.addEventListener('mouseover', (e) => {
    const t = overflowing(e.target);
    if (t && t !== current) show(t);
    else if (!t && current) hide();
  });
  document.addEventListener('mouseout', (e) => {
    if (current && !current.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('scroll', hide, true);
  return { show, hide };
}
