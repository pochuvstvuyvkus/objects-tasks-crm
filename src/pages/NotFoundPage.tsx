import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export function NotFoundPage() {
  return (
    <Empty>
      Страница не найдена. <Link to="/objects">К объектам</Link>
    </Empty>
  );
}
