import { useEffect, useState } from "react";
import axios from "axios";
import UserRow from "./UserRow";

const UserList = () => {

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {

    try {

      const res = await axios.get("http://localhost:5000/api/users/view");

      const mappedUsers = res.data.users.map(user => {

        const roleClass =
          user.user_type === "ADMIN" ? "admin" : "worker";

        return {
          id: user.userId,
          role: user.user_type,
          name: user.name,
          status: roleClass,
          raw: user
        };

      });

      setUsers(mappedUsers);

    } catch (err) {

      console.error("Failed to fetch users", err);

    } finally {

      setLoading(false);

    }

  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="users-list">

      {loading && (
        <div className="list-message">
          Loading users...
        </div>
      )}

      {!loading && users.length === 0 && (
        <div className="list-message">
          No users found
        </div>
      )}

      {!loading &&
        users.map(user => (
          <UserRow
            key={user.id}
            user={user}
            onUserChanged={fetchUsers}
          />
        ))
      }

    </div>
  );
};

export default UserList;