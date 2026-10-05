'use client';

export function CourseSort({ value }: { value: string }) {
  return <label>Sorter etter<select name="sort" defaultValue={value} onChange={event => event.currentTarget.form?.requestSubmit()}>
    <option value="newest">Nyeste først</option>
    <option value="price">Laveste pris</option>
    <option value="price_desc">Høyeste pris</option>
    <option value="duration">Kortest varighet</option>
  </select></label>;
}
